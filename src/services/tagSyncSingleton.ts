import { TagSyncService } from './tagSyncService';

let instance: TagSyncService | null = null;

export function setTagSyncService(svc: TagSyncService) {
  instance = svc;
}

export function getTagSyncService(): TagSyncService | null {
  return instance;
}
