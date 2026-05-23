import anthropic from './anthropic.svg';
import openai from './openai.svg';
import google from './google.svg';
import openrouter from './openrouter.svg';
import ark from './ark.svg';
import moonshot from './moonshot.svg';
import siliconflow from './siliconflow.svg';
import minimaxPortal from './minimax.svg';
import qwenPortal from './qwen.svg';
import zaiPortal from './zai.svg';
import stepfunPortal from './stepfun.svg';
import xai from './xai.svg';
import mistral from './mistral.svg';
import groq from './groq.svg';
import together from './together.svg';
import fireworks from './fireworks.svg';
import ollama from './ollama.svg';
import custom from './custom.svg';
import deepseek from './deepseek.svg';

export const providerIcons: Record<string, string> = {
    anthropic,
    openai,
    google,
    openrouter,
    ark,
    moonshot,
    'moonshot-global': moonshot,
    'kimi-coding': moonshot,
    siliconflow,
    'minimax-portal': minimaxPortal,
    'minimax-portal-cn': minimaxPortal,
    'modelstudio': qwenPortal,
    'qwen-coding-cn': qwenPortal,
    'qwen-standard-global': qwenPortal,
    'qwen-standard-cn': qwenPortal,
    'zai': zaiPortal,
    'stepfun': stepfunPortal,
    'stepfun-plan': stepfunPortal,
    'xai': xai,
    'mistral': mistral,
    'groq': groq,
    'together': together,
    'fireworks': fireworks,
    ollama,
    custom,
    deepseek,
};
