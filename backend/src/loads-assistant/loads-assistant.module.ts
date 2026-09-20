import { Module } from '@nestjs/common';
import { LoadsAssistantController } from './loads-assistant.controller';
import { LoadsAssistantService } from './loads-assistant.service';
import { BasicFlowEngine } from './basic-flow.engine';
import { FlowConfigService } from './flow-config.service';
import { ChainLlmProvider } from './llm/chain.provider';
import { GeminiProvider } from './llm/gemini.provider';
import { GroqProvider } from './llm/groq.provider';
import { LLM_PROVIDER } from './llm/llm-provider';

@Module({
  controllers: [LoadsAssistantController],
  providers: [
    LoadsAssistantService,
    FlowConfigService,
    BasicFlowEngine,
    GeminiProvider,
    GroqProvider,
    // El asistente depende de la interfaz LLM_PROVIDER. La cadena intenta
    // Gemini primero y cae a Groq si falla (cuota agotada, timeout, 5xx);
    // agregar otro proveedor es sumarlo a esta lista. Si ninguno responde, el
    // service degrada al BasicFlowEngine (sin LLM).
    {
      provide: LLM_PROVIDER,
      inject: [GeminiProvider, GroqProvider],
      useFactory: (gemini: GeminiProvider, groq: GroqProvider) =>
        new ChainLlmProvider([gemini, groq]),
    },
  ],
})
export class LoadsAssistantModule {}
