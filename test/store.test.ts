import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { runStoreContract } from './store-contract.ts'

runStoreContract('memory store', createMemoryStore)
