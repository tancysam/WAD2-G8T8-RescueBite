import Notification from "../models/Notification.js";
import Business from "../models/Business.js";

export async function notify(userId, message) {
  if (!userId) return;

  try {
    await Notification.addNotification({
      user_id: userId,
      message
    });
  } catch (error) {
    console.error("Notification failed:", error);
  }
}

export async function notifyBusiness(reservation, message) {
  try {
    const businessId = reservation.listing_snapshot?.business_id;
    if (!businessId) return;

    const business = await Business.findBusinessById(businessId);

    if (business) {
      await notify(business.owner_user_id, message);
    }
  } catch (error) {
    console.error("Business notification failed:", error);
  }
}

export async function notifyConsumers(reservations, message) {
    const userIds = [];

    for (const reservation of reservations) {
        const userId = String(reservation.consumer_user_id);

        if (!userIds.includes(userId)) {
            userIds.push(userId);
        }
    }

    for (const id of userIds) {
        await notify(id, message);
    }
}