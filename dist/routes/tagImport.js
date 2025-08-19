"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const tagImportService_1 = require("../services/tagImportService");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});
// POST /api/v1/tags/import/:projectId
router.post('/:projectId/import', authMiddleware_1.authenticateToken, authMiddleware_1.authorizeProjectAccess, upload.single('file'), async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const { vendor, format } = req.body;
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        let result;
        switch (vendor) {
            case 'rockwell':
                result = await (0, tagImportService_1.importRockwellTags)(projectId, file, format, userId);
                break;
            case 'siemens':
                result = await (0, tagImportService_1.importSiemensTags)(projectId, file, format, userId);
                break;
            case 'beckhoff':
                result = await (0, tagImportService_1.importBeckhoffTags)(projectId, file, format, userId);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Unsupported vendor'
                });
        }
        // Return import results
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Error importing tags:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
exports.default = router;
