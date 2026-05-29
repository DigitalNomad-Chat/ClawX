import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useProviderStore } from '@/stores/providers';
import {
  buildRuntimeProviderOptions,
  splitModelRef,
  type RuntimeProviderOption,
} from '@/lib/model-options';
import { useTranslation } from 'react-i18next';

interface ModelSelectorModalProps {
  title: string;
  description?: string;
  defaultModelRef?: string | null;
  currentModelRef?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  useDefaultLabel?: string;
  onSave: (modelRef: string | null) => Promise<void>;
  onClose: () => void;
}

const inputClasses = 'h-[44px] rounded-xl font-mono text-sm bg-surface-input border focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground placeholder:text-foreground/40';
const selectClasses = 'h-[44px] w-full rounded-xl font-mono text-sm bg-surface-input border border focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground px-3';

export function ModelSelectorModal({
  title,
  description,
  defaultModelRef,
  currentModelRef,
  submitLabel,
  cancelLabel,
  useDefaultLabel,
  onSave,
  onClose,
}: ModelSelectorModalProps) {
  const { t } = useTranslation('agents');
  const providerAccounts = useProviderStore((state) => state.accounts);
  const providerStatuses = useProviderStore((state) => state.statuses);
  const providerVendors = useProviderStore((state) => state.vendors);
  const providerDefaultAccountId = useProviderStore((state) => state.defaultAccountId);

  const [selectedRuntimeProviderKey, setSelectedRuntimeProviderKey] = useState('');
  const [modelIdInput, setModelIdInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const runtimeProviderOptions = useMemo<RuntimeProviderOption[]>(
    () => buildRuntimeProviderOptions(
      providerAccounts,
      providerStatuses,
      providerVendors,
      providerDefaultAccountId,
    ),
    [providerAccounts, providerDefaultAccountId, providerStatuses, providerVendors],
  );

  useEffect(() => {
    const effective = splitModelRef(currentModelRef || defaultModelRef);
    if (effective) {
      setSelectedRuntimeProviderKey(effective.providerKey);
      setModelIdInput(effective.modelId);
      return;
    }
    setSelectedRuntimeProviderKey(runtimeProviderOptions[0]?.runtimeProviderKey || '');
    setModelIdInput('');
  }, [currentModelRef, defaultModelRef, runtimeProviderOptions]);

  const selectedProvider = runtimeProviderOptions.find(
    (option) => option.runtimeProviderKey === selectedRuntimeProviderKey,
  ) || null;
  const trimmedModelId = modelIdInput.trim();
  const nextModelRef = selectedRuntimeProviderKey && trimmedModelId
    ? `${selectedRuntimeProviderKey}/${trimmedModelId}`
    : '';

  const normalizedDefaultModelRef = (defaultModelRef || '').trim();
  const isUsingDefaultModelInForm = Boolean(normalizedDefaultModelRef) && nextModelRef === normalizedDefaultModelRef;
  const currentRefTrimmed = (currentModelRef || '').trim();
  const desiredModelRef = nextModelRef && nextModelRef !== normalizedDefaultModelRef
    ? nextModelRef
    : null;
  const modelChanged = (desiredModelRef || '') !== currentRefTrimmed;

  const handleRequestClose = () => {
    if (saving || modelChanged) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!selectedRuntimeProviderKey) return;
    if (!trimmedModelId) return;
    if (!modelChanged) return;
    if (!nextModelRef.includes('/')) return;

    setSaving(true);
    try {
      await onSave(desiredModelRef);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleUseDefaultModel = () => {
    const parsedDefault = splitModelRef(normalizedDefaultModelRef);
    if (!parsedDefault) {
      setSelectedRuntimeProviderKey('');
      setModelIdInput('');
      return;
    }
    setSelectedRuntimeProviderKey(parsedDefault.providerKey);
    setModelIdInput(parsedDefault.modelId);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl rounded-xl border shadow-lg bg-card overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-xl font-bold">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm mt-1 text-foreground/70">
                {description}
              </CardDescription>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRequestClose}
            className="rounded-lg h-8 w-8 -mr-2 -mt-2 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-4">
          <div className="space-y-2">
            <Label className="text-xs text-foreground/70">{t('settingsDialog.modelProviderLabel')}</Label>
            <select
              value={selectedRuntimeProviderKey}
              onChange={(event) => {
                const nextProvider = event.target.value;
                setSelectedRuntimeProviderKey(nextProvider);
                if (!modelIdInput.trim()) {
                  const option = runtimeProviderOptions.find(
                    (candidate) => candidate.runtimeProviderKey === nextProvider,
                  );
                  setModelIdInput(option?.configuredModelId || '');
                }
              }}
              className={selectClasses}
            >
              <option value="">{t('settingsDialog.modelProviderPlaceholder')}</option>
              {runtimeProviderOptions.map((option) => (
                <option key={option.runtimeProviderKey} value={option.runtimeProviderKey}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-foreground/70">{t('settingsDialog.modelIdLabel')}</Label>
            <Input
              value={modelIdInput}
              onChange={(event) => setModelIdInput(event.target.value)}
              placeholder={selectedProvider?.modelIdPlaceholder || selectedProvider?.configuredModelId || t('settingsDialog.modelIdPlaceholder')}
              className={inputClasses}
            />
          </div>
          {!!nextModelRef && (
            <p className="text-xs font-mono text-foreground/70 break-all">
              {t('settingsDialog.modelPreview')}: {nextModelRef}
            </p>
          )}
          {runtimeProviderOptions.length === 0 && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t('settingsDialog.modelProviderEmpty')}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleUseDefaultModel}
              disabled={saving || !normalizedDefaultModelRef || isUsingDefaultModelInForm}
            >
              {useDefaultLabel || t('settingsDialog.useDefaultModel')}
            </Button>
            <Button variant="outline" onClick={handleRequestClose}>
              {cancelLabel || t('common:actions.cancel')}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !selectedRuntimeProviderKey || !trimmedModelId || !modelChanged}
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : (submitLabel || t('common:actions.save'))}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={showCloseConfirm}
        title={t('settingsDialog.unsavedChangesTitle')}
        message={t('settingsDialog.unsavedChangesMessage')}
        confirmLabel={t('settingsDialog.closeWithoutSaving')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => {
          setShowCloseConfirm(false);
          onClose();
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}
