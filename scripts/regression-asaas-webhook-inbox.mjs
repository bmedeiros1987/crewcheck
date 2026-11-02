import {createAsaasMemory} from './fixtures/asaas-inbox-memory.mjs';
import {runAsaasScenarios} from './asaas-inbox-scenarios.mjs';
globalThis.fetch=()=>{throw Error('No provider/network access in Asaas fixture');};
await runAsaasScenarios(createAsaasMemory());
