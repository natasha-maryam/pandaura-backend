"use strict";
// import express from 'express';
// import multer from 'multer';
// import { authenticateToken, authorizeProjectAccess } from '../middleware/authMiddleware';
// import { ProjectAuthRequest } from '../types';
// import { importBeckhoffTags, importRockwellTags, importSiemensTags } from '../services/tagImportService';
// const router = express.Router();
// const upload = multer({
//   limits: {
//     fileSize: 10 * 1024 * 1024 // 10MB limit
//   }
// });
// // POST /api/v1/tags/import/:projectId
// router.post('/:projectId/import', 
//   authenticateToken,
//   authorizeProjectAccess,
//   upload.single('file'),
//   async (req: ProjectAuthRequest, res) => {
//     try {
//       const projectId = parseInt(req.params.projectId, 10);
//       const { vendor, format } = req.body;
//       const file = req.file;
//       if (!file) {
//         return res.status(400).json({ 
//           success: false, 
//           error: 'No file uploaded' 
//         });
//       }
//       const userId = req.user?.userId;
//       if (!userId) {
//         return res.status(401).json({
//           success: false,
//           error: 'User not authenticated'
//         });
//       }
//       let result;
//       switch (vendor) {
//         case 'rockwell':
//           result = await importRockwellTags(projectId, file, format, userId);
//           break;
//         case 'siemens':
//           result = await importSiemensTags(projectId, file, format, userId);
//           break;
//         case 'beckhoff':
//           result = await importBeckhoffTags(projectId, file, format, userId);
//           break;
//         default:
//           return res.status(400).json({ 
//             success: false, 
//             error: 'Unsupported vendor' 
//           });
//       }
//       // Return import results
//       res.json({
//         success: true,
//         data: result
//       });
//     } catch (error) {
//       console.error('Error importing tags:', error);
//       res.status(500).json({ 
//         success: false, 
//         error: error instanceof Error ? error.message : 'Internal server error' 
//       });
//     }
//   }
// );
// export default router;
