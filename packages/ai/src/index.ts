export * from './contract.js';
export {
  buildDiagnosisPrompt,
  createOpenAICompatibleClient,
  diagnoseWithModel,
  type DiagnosisModelClient,
  type DiagnosisServiceOptions,
  type DiagnosisServiceResult,
  type DiagnosisSource,
  type OpenAICompatibleClientOptions
} from './service.js';
