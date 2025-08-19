"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTagSyncService = setTagSyncService;
exports.getTagSyncService = getTagSyncService;
let instance = null;
function setTagSyncService(svc) {
    instance = svc;
}
function getTagSyncService() {
    return instance;
}
