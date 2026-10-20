import {Router} from 'express';
import {requireAuth} from '../middleware/auth.js'
import {
    getNotifications, 
    getUnreadStatus,
     markNotificationsAsRead, 
     clearAllNotifications
    } from '../controllers/notificationController.js';

const router = Router()
router.use(requireAuth);

//routes
router.get('/', getNotifications);
router.get('/unread', getUnreadStatus);
router.patch('/read', markNotificationsAsRead);
router.delete('/', clearAllNotifications);

export default router;
