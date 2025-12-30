import { createMMKV, type MMKV } from 'react-native-mmkv'
import { getMMKVKey } from '../utils/mmkvKeyManager'
import { logWarn } from '../utils/logger'

/**
 * Storage adapter interface for Zustand persistence
 */
export interface StorageAdapter {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
}

/**
 * Maximum number of storage instances to cache before evicting least recently used
 * This prevents unbounded memory growth while maintaining performance
 */
const MAX_STORAGE_CACHE_SIZE = 10

/**
 * Cache for MMKV storage instances to avoid recreating them
 * Uses LRU (Least Recently Used) eviction policy to limit memory usage
 */
const storageCache = new Map<string, MMKV>()
const storageAccessOrder = new Map<string, number>()
let storageAccessCounter = 0

/**
 * Evict least recently used storage instance from cache when limit is reached
 */
function evictLRUStorage(): void {
  if (storageCache.size < MAX_STORAGE_CACHE_SIZE) {
    return
  }

  // Find the least recently used storage
  let oldestKey: string | null = null
  let oldestAccess = Infinity

  for (const [key, accessTime] of storageAccessOrder.entries()) {
    if (accessTime < oldestAccess) {
      oldestAccess = accessTime
      oldestKey = key
    }
  }

  // Remove the least recently used storage
  if (oldestKey !== null) {
    storageCache.delete(oldestKey)
    storageAccessOrder.delete(oldestKey)
  }
}

/**
 * Create MMKV storage instance for the wallet
 * 
 * SECURITY NOTE: MMKV stores files in the app's document directory, which is app-scoped.
 * Two different apps will NOT share data because each app has its own isolated document directory.
 * 
 * This is for non-sensitive data persistence (wallet metadata, balances, addresses).
 * For sensitive data (encrypted seeds, keys), use SecureStorage from wdk-rn-secure-storage.
 * 
 * The encryption key is derived from a device/app identifier to ensure each app instance
 * has a unique encryption key. If no account identifier is provided, a default app-scoped
 * identifier is used.
 * 
 * @param accountIdentifier - Optional account identifier for per-account encryption keys.
 *                            If not provided, uses a default app-scoped identifier.
 * @returns Promise that resolves to MMKV storage instance
 */
export async function createMMKVStorage(accountIdentifier?: string): Promise<MMKV> {
  // Use account identifier if provided, otherwise use a default app-scoped identifier
  // This ensures each app instance has a unique key while allowing per-account keys
  const identifier = accountIdentifier || 'wdk-app-default'
  
  // Check cache first
  const cachedStorage = storageCache.get(identifier)
  if (cachedStorage !== undefined) {
    // Update access time for LRU tracking
    storageAccessCounter++
    storageAccessOrder.set(identifier, storageAccessCounter)
    return cachedStorage
  }
  
  // Evict LRU storage if cache is full
  evictLRUStorage()
  
  // Derive encryption key asynchronously
  const encryptionKey = await getMMKVKey(identifier)
  
  const storage = createMMKV({
    id: 'wallet-storage',
    encryptionKey,
  })
  
  // Cache the storage instance
  storageAccessCounter++
  storageCache.set(identifier, storage)
  storageAccessOrder.set(identifier, storageAccessCounter)
  
  return storage
}

/**
 * Maximum number of storage adapters to cache before evicting least recently used
 * This prevents unbounded memory growth while maintaining performance
 */
const MAX_ADAPTER_CACHE_SIZE = 10

/**
 * Storage adapter cache - stores initialized adapters by identifier
 * Uses LRU (Least Recently Used) eviction policy to limit memory usage
 */
const adapterCache = new Map<string, StorageAdapter>()
const adapterAccessOrder = new Map<string, number>()
let adapterAccessCounter = 0

/**
 * Evict least recently used adapter from cache when limit is reached
 */
function evictLRUAdapter(): void {
  if (adapterCache.size < MAX_ADAPTER_CACHE_SIZE) {
    return
  }

  // Find the least recently used adapter
  let oldestKey: string | null = null
  let oldestAccess = Infinity

  for (const [key, accessTime] of adapterAccessOrder.entries()) {
    if (accessTime < oldestAccess) {
      oldestAccess = accessTime
      oldestKey = key
    }
  }

  // Remove the least recently used adapter
  if (oldestKey !== null) {
    adapterCache.delete(oldestKey)
    adapterAccessOrder.delete(oldestKey)
  }
}

/**
 * Pending operations queue for storage adapters during initialization
 */
interface PendingOperation {
  type: 'get' | 'set' | 'remove'
  key: string
  value?: string
  resolve: (value: string | null) => void
  reject: (error: Error) => void
}

/**
 * Storage initialization state
 */
enum StorageInitState {
  NOT_STARTED = 'NOT_STARTED',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  ERROR = 'ERROR',
}

/**
 * Storage adapter factory for Zustand persistence
 * This allows Zustand stores to use MMKV for persistence
 * 
 * Uses lazy async initialization with synchronous API.
 * Storage is initialized asynchronously when first accessed, then cached.
 * Operations are queued during initialization to prevent race conditions.
 * 
 * IMPORTANT: The synchronous API (getItem) may return null during initialization.
 * This is expected behavior - Zustand will handle missing data gracefully on first load.
 * Subsequent operations will be queued and processed once storage is ready.
 * 
 * @param accountIdentifier - Optional account identifier for per-account encryption keys.
 *                            If not provided, uses a default app-scoped identifier.
 * @returns StorageAdapter with lazy async initialization
 */
export function createMMKVStorageAdapter(accountIdentifier?: string): StorageAdapter {
  const identifier = accountIdentifier || 'wdk-app-default'
  
  // Return cached adapter if available
  const cachedAdapter = adapterCache.get(identifier)
  if (cachedAdapter !== undefined) {
    // Update access time for LRU tracking
    adapterAccessCounter++
    adapterAccessOrder.set(identifier, adapterAccessCounter)
    return cachedAdapter
  }
  
  // Evict LRU adapter if cache is full
  evictLRUAdapter()
  
  let storageInstance: MMKV | null = null
  let storagePromise: Promise<MMKV> | null = null
  let initState: StorageInitState = StorageInitState.NOT_STARTED
  let initError: Error | null = null
  const pendingOperations: PendingOperation[] = []
  
  // Process queued operations after storage is ready
  const processPendingOperations = (storage: MMKV): void => {
    // Process all pending operations in order
    const operations = [...pendingOperations]
    pendingOperations.length = 0 // Clear the array
    
    for (const op of operations) {
      try {
        switch (op.type) {
          case 'get':
            const value = storage.getString(op.key)
            op.resolve(value ?? null)
            break
          case 'set':
            if (op.value !== undefined) {
              storage.set(op.key, op.value)
              op.resolve(null)
            }
            break
          case 'remove':
            ;(storage as MMKVWithDelete).delete(op.key)
            op.resolve(null)
            break
        }
      } catch (error) {
        op.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }
  
  // Initialize storage asynchronously
  const ensureStorage = async (): Promise<MMKV> => {
    // Return immediately if already ready
    if (storageInstance && initState === StorageInitState.READY) {
      return storageInstance
    }
    
    // Return existing promise if initializing
    if (storagePromise && initState === StorageInitState.INITIALIZING) {
      return storagePromise
    }
    
    // If we're in error state, throw the error
    if (initState === StorageInitState.ERROR && initError) {
      throw initError
    }
    
    // Start initialization
    if (initState === StorageInitState.NOT_STARTED) {
      initState = StorageInitState.INITIALIZING
      initError = null
      
      storagePromise = createMMKVStorage(identifier)
        .then((storage) => {
          storageInstance = storage
          initState = StorageInitState.READY
          initError = null
          
          // Process all pending operations
          processPendingOperations(storage)
          
          return storage
        })
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error))
          initState = StorageInitState.ERROR
          initError = err
          storagePromise = null
          
          // Reject all pending operations
          const operations = [...pendingOperations]
          pendingOperations.length = 0
          for (const op of operations) {
            op.reject(err)
          }
          
          throw err
        })
    }
    
    // At this point, storagePromise should be set
    if (!storagePromise) {
      const err = new Error('Failed to initialize storage: promise not created')
      initState = StorageInitState.ERROR
      initError = err
      throw err
    }
    
    return storagePromise
  }
  
  // Start initialization immediately in the background
  // This helps reduce the window where operations need to be queued
  ensureStorage().catch((error) => {
    // Error is stored in initError and will be thrown on next access
    // This prevents unhandled promise rejections
  })
  
  const adapter: StorageAdapter = {
    getItem: (name: string): string | null => {
      // If storage is ready, read directly
      if (storageInstance && initState === StorageInitState.READY) {
        try {
          const value = storageInstance.getString(name)
          return value ?? null
        } catch (error) {
          // If read fails, return null (Zustand will handle gracefully)
          return null
        }
      }
      
      // If we're in error state, return null (Zustand will handle gracefully)
      // The error will be thrown on next write operation
      if (initState === StorageInitState.ERROR) {
        return null
      }
      
      // LIMITATION: During initialization, we cannot return values synchronously
      // because storage initialization is async. Zustand's StorageAdapter interface
      // requires synchronous getItem, so we must return null during initialization.
      // 
      // This is expected behavior:
      // - On first load during initialization: returns null, Zustand uses default state
      // - After initialization: subsequent getItem calls will work correctly
      // - Zustand handles null gracefully and will rehydrate on next read after init
      //
      // We don't queue get operations because we can't fulfill them synchronously.
      // Instead, we ensure storage is initializing and return null immediately.
      ensureStorage().catch(() => {
        // Errors are handled in ensureStorage and stored in initError
      })
      
      // Return null during initialization - Zustand handles this gracefully
      // The actual value will be available on next read after initialization completes
      return null
    },
    setItem: (name: string, value: string): void => {
      // If storage is ready, write directly
      if (storageInstance && initState === StorageInitState.READY) {
        try {
          storageInstance.set(name, value)
          return
        } catch (error) {
          // If write fails, queue it to retry later
          // This handles edge cases where storage becomes unavailable
        }
      }
      
      // Queue the write operation
      pendingOperations.push({
        type: 'set',
        key: name,
        value,
        resolve: () => {
          // Operation completed successfully
        },
        reject: (error) => {
          // Log error but don't throw - this is non-critical data
          // In production, you might want to log this to error tracking
          logWarn('[MMKVStorageAdapter] Failed to set item:', name, error)
        },
      })
      
      // Ensure storage is initializing
      ensureStorage().catch((error) => {
        // Error is stored and will be thrown when processing pending operations
        // This ensures queued operations fail appropriately
      })
    },
    removeItem: (name: string): void => {
      // If storage is ready, delete directly
      if (storageInstance && initState === StorageInitState.READY) {
        try {
          ;(storageInstance as MMKVWithDelete).delete(name)
          return
        } catch (error) {
          // If delete fails, queue it to retry later
        }
      }
      
      // Queue the delete operation
      pendingOperations.push({
        type: 'remove',
        key: name,
        resolve: () => {
          // Operation completed successfully
        },
        reject: (error) => {
          // Log error but don't throw - this is non-critical data
          logWarn('[MMKVStorageAdapter] Failed to remove item:', name, error)
        },
      })
      
      // Ensure storage is initializing
      ensureStorage().catch((error) => {
        // Error is stored and will be thrown when processing pending operations
      })
    },
  }
  
  // Cache the adapter
  adapterAccessCounter++
  adapterCache.set(identifier, adapter)
  adapterAccessOrder.set(identifier, adapterAccessCounter)
  
  return adapter
}

/**
 * Extended MMKV type that includes the delete method
 * MMKV has a delete method but TypeScript types may not include it
 */
interface MMKVWithDelete extends MMKV {
  delete(key: string): void
}

