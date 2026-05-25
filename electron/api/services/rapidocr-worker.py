#!/usr/bin/env python3
"""
RapidOCR Worker — standalone Python process for OCR.

Run via child_process.spawn to isolate Python OCR from the Electron main process.

Usage (stdin JSON):
  { "type": "image", "base64": "<base64-str>" }
  { "type": "file", "path": "/path/to/image.png" }
  { "type": "pdf", "path": "/path/to/file.pdf", "dpi": 200 }

Output (stdout JSON lines):
  { "success": true, "fullText": "...", "blocks": [...], "pageCount": 1 }
  { "success": false, "error": "..." }
"""
import base64
import json
import os
import sys
import tempfile
from io import BytesIO


def _send(obj: dict):
    """Flush JSON line to stdout immediately."""
    try:
        print(json.dumps(obj, ensure_ascii=False))
        sys.stdout.flush()
    except Exception:
        # Last resort: stderr
        sys.stderr.write(f"CRITICAL: failed to serialize response: {obj}\n")
        sys.stderr.flush()


def _check_deps():
    """Check if required packages are available. Return (ok, error_msg)."""
    missing = []
    try:
        import PIL  # noqa: F401
    except ImportError:
        missing.append("pillow")
    try:
        import rapidocr_onnxruntime  # noqa: F401
    except ImportError:
        missing.append("rapidocr-onnxruntime")
    if missing:
        return False, f"Missing Python packages: {', '.join(missing)}. Run: pip install -r requirements-ocr.txt"
    return True, ""


def _get_engine():
    """Lazy init RapidOCR engine."""
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR()


def _recognize(source) -> dict:
    """Run OCR on a PIL Image or file path / bytes."""
    from PIL import Image
    engine = _get_engine()

    try:
        if isinstance(source, str):
            if not os.path.exists(source):
                raise FileNotFoundError(f"Image file not found: {source}")
            result, _ = engine(source)
        elif isinstance(source, bytes):
            image = Image.open(BytesIO(source))
            result, _ = engine(image)
        elif isinstance(source, Image.Image):
            result, _ = engine(source)
        else:
            raise TypeError("source must be str (file path), bytes, or PIL.Image")
    except Exception as exc:
        raise RuntimeError(f"OCR recognition failed: {exc}") from exc

    blocks = []
    full_text_parts = []

    if result is None:
        return {"fullText": "", "blocks": [], "pageCount": 1}

    for item in result:
        # rapidocr returns: [bbox, text, confidence]
        bbox, text, confidence = item
        block = {
            "type": "text",
            "bbox": bbox,
            "content": text,
            "confidence": float(confidence),
        }
        blocks.append(block)
        if text:
            full_text_parts.append(text)

    return {
        "fullText": "\n".join(full_text_parts),
        "blocks": blocks,
        "pageCount": 1,
    }


def _process_pdf(pdf_path: str, dpi: int = 200) -> dict:
    """Convert PDF pages to images and OCR each page."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF (fitz) is required for PDF OCR. Install: pip install pymupdf")

    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    doc = fitz.open(pdf_path)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)

    all_blocks = []
    all_text_parts = []
    page_count = 0
    temp_files = []

    try:
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=mat)

            fd, temp_path = tempfile.mkstemp(suffix=".png")
            os.close(fd)
            pix.save(temp_path)
            temp_files.append(temp_path)

            result = _recognize(temp_path)
            all_text_parts.append(result["fullText"])
            all_blocks.extend(result["blocks"])
            page_count += 1
    finally:
        doc.close()
        for tp in temp_files:
            try:
                if os.path.exists(tp):
                    os.remove(tp)
            except OSError:
                pass

    return {
        "fullText": "\n".join(all_text_parts),
        "blocks": all_blocks,
        "pageCount": page_count,
    }


def main():
    # Check dependencies before reading stdin
    ok, err_msg = _check_deps()
    if not ok:
        _send({"success": False, "error": err_msg})
        sys.exit(1)

    input_buffer = ""
    for line in sys.stdin:
        input_buffer += line

    if not input_buffer.strip():
        _send({"success": False, "error": "Empty input"})
        return

    try:
        req = json.loads(input_buffer)
    except json.JSONDecodeError as exc:
        _send({"success": False, "error": f"Invalid JSON input: {exc}"})
        return

    try:
        req_type = req.get("type", "image")

        if req_type == "image":
            b64 = req.get("base64", "")
            if not b64:
                _send({"success": False, "error": "Missing base64 field"})
                return
            data = base64.b64decode(b64)
            result = _recognize(data)
            _send({"success": True, **result})

        elif req_type == "file":
            path = req.get("path", "")
            if not path:
                _send({"success": False, "error": "Missing path field"})
                return
            result = _recognize(path)
            _send({"success": True, **result})

        elif req_type == "pdf":
            path = req.get("path", "")
            dpi = req.get("dpi", 200)
            if not path:
                _send({"success": False, "error": "Missing path field"})
                return
            result = _process_pdf(path, dpi)
            _send({"success": True, **result})

        else:
            _send({"success": False, "error": f"Unknown type: {req_type}"})

    except Exception as exc:
        _send({"success": False, "error": str(exc)})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        _send({"success": False, "error": f"Unhandled worker error: {e}"})
        sys.exit(1)
