const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at"
        }
    }
);

notificationSchema.index({
    user_id: 1,
    created_at: -1
});

const Notifications = mongoose.model("Notification", notificationSchema, "notifications")

//retrieves notifications respective to the user
function findNotificationsByUser(userId, skip=0, limit=5) {
    return Notification.find({user_id: userId}
        .sort({created_at: -1, _id:-1})
        .skip(skip)
        .limit(limit)
    );
}

// checks if user has any unread notifs
function hasUnreadNotifications(userId) {
    return Notification.exists({
        user_id: userId, is_read: false
    });
}

// mark loaded notifs as read once the user opens the notif bar
function markNotificationsAsRead(userId, notificationIds) {
  return Notification.updateMany(
    {
      user_id: userId,
      _id: { $in: notificationIds }
    },
    {
      $set: { is_read: true }
    }
  );
}

// create notifs
function addNotification(data) {
  return Notification.create(data);
}

// clear all notifs
function clearAllNotifications(userId) {
  return Notification.deleteMany({
    user_id: userId
  });
}

module.exports = {
  findNotificationsByUser,
  hasUnreadNotifications,
  markNotificationsAsRead,
  addNotification,
  clearAllNotifications
};