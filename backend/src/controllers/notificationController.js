import Notification from "../models/Notification.js"
import mongoose from "mongoose";

export async function getNotifications(req, res) {
    const page = Number(req.query.page || 1);

    if(!Number.isInteger(page) || page <1) {
        return res.status(400).json({error: "Invalid page number"});
    }

    const limit = 5;
    const skip = (page-1)*limit;

    try {
        const results = await Notification.findNotificationsByUser(
            req.user._id, skip, limit+1
        );

        const hasMore = results.length > limit;
        const shownNotifications = results.slice(0, limit);

        return res.status(200).json({shownNotifications, hasMore});
    } catch (error) {
        console.error("Error retrieving notifications:", error);
        return res.status(500).json({error: "Unable to retrieve notifications"})
    }
}

export async function createNotification(userId, message) {
    try {
        const notification = await Notification.addNotification({user_id: userId, message: message});
        return notification
    } catch (error) {
        console.error("Error creating notification:", error);
        throw error;
    }
}

export async function getUnreadStatus (req, res) {
    try {
        const unread = await Notification.hasUnreadNotifications(req.user._id);
        return res.status(200).json({hasUnread: !!unread}) //!! converts to boolean
    } catch (error) {
        console.error("Error checking unread notifications:", error);
        return res.status(500).json({error: "Unable to check for unread notifications"})
    }
}

export async function markNotificationsAsRead(req, res) {
    const notificationIds = req.body?.notificationIds; //

    if (
        !Array.isArray(notificationIds) || notificationIds.length===0 || notificationIds.length>5 || 
        !notificationIds.every(id => mongoose.isValidObjectId(id))
    ) {return res.status(400).json({error:"issue with notifications"})}

    try {
        await Notification.markNotificationsAsRead(req.user._id, notificationIds);
        return res.status(200).json({message: "current notifications marked as read"})
    } catch (error) {
        console.error("Error marking notifications as read:", error);
        return res.status(500).json({error: "Unable to mark notifications as read"})
    }
}

export async function clearAllNotifications(req,res) {
    try{
        await Notification.clearAllNotifications(req.user._id);
        return res.status(200).json({message: "All notifications cleared"});
    } catch (error) {
        console.error("Error clearing notifications", error);
        return res.status(500).json({error: "Unable to clear notifications"});
    }
}