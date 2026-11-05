import Reservation from "../models/Reservation.js";
import Listing from "../models/Listing.js";


const PAYMENT_ELIGIBLE = ["PAID", "NOT_REQUIRED"];

export function isPairedLeg(reservation) {
  return !!(reservation && reservation.bundle_state);
}

export function isPaymentEligible(reservation) {
  return !!reservation && PAYMENT_ELIGIBLE.indexOf(reservation.payment_status) !== -1;
}

function isEnded(reservation) {
  return reservation.status === "CANCELLED" || reservation.status === "EXPIRED";
}

export function sortLegs(legs) {
  const sorted = [];
  for (const number of [1, 2]) {
    const leg = legs.find(function (item) {
      return item.bundle_state && item.bundle_leg === number;
    });
    if (leg) sorted.push(leg);
  }
  return sorted;
}

export async function loadPartner(reservation) {
  const legs = sortLegs(await Reservation.findByBundleGroup(reservation.bundle_group_id));
  for (const leg of legs) {
    if (
      leg._id.toString() !== reservation._id.toString() &&
      leg.bundle_leg !== reservation.bundle_leg &&
      leg.consumer_user_id.toString() === reservation.consumer_user_id.toString()
    ) {
      return leg;
    }
  }
  return null;
}

export function pairStatus(reservation, partner) {
  if (!isPairedLeg(reservation)) return "NONE";
  if (reservation.status === "COLLECTED") return "COMMITTED";
  if (partner && partner.status === "COLLECTED") return "COMMITTED";
  if (isEnded(reservation) || (partner && isEnded(partner))) return "VOID";
  if (reservation.bundle_state === "ACTIVE" && partner && partner.bundle_state === "ACTIVE") return "READY";
  return "FORMING";
}

export async function pairStatusOf(reservation) {
  if (!isPairedLeg(reservation)) return "NONE";
  return pairStatus(reservation, await loadPartner(reservation));
}

export async function closePair(legs) {
  for (const leg of legs) {
    if (leg.status === "RESERVED") await Reservation.cancelBundleLeg(leg._id);
  }
}

export async function enforcePair(reservation) {
  const current = await Reservation.findReservationById(reservation._id);
  if (!current || !isPairedLeg(current) || current.status !== "RESERVED") return current;
  const partner = await loadPartner(current);
  if (pairStatus(current, partner) === "VOID") {
    await Reservation.cancelBundleLeg(current._id);
    return Reservation.findReservationById(current._id);
  }
  return current;
}

export async function checkoutGate(reservation) {
  const current = await enforcePair(reservation);
  if (!current) return { gate: "CLOSED", current };
  if (current.status !== "RESERVED") return { gate: "CLOSED", current };
  const status = pairStatus(current, await loadPartner(current));
  if (status === "READY" || status === "COMMITTED") return { gate: "OPEN", current };
  if (status === "VOID") return { gate: "CLOSED", current };
  return { gate: "WAIT", current };
}

export async function collectionProblem(reservation) {
  if (!isPairedLeg(reservation)) return "";
  const partner = await loadPartner(reservation);
  const status = pairStatus(reservation, partner);
  if (status === "VOID") {
    return "This bundle was cancelled because the other item is no longer available";
  }
  if (status === "FORMING") {
    return "This bundle is still being confirmed. Try again shortly";
  }
  if (!isPaymentEligible(reservation) || !isPaymentEligible(partner)) {
    return "Both items in this bundle must be paid before either one can be collected";
  }
  if (partner.status !== "RESERVED" && partner.status !== "COLLECTED") {
    return "This bundle was cancelled because the other item is no longer available";
  }
  return "";
}

export async function isNoShowAfterPartnerCollected(reservation) {
  if (!isPairedLeg(reservation) || reservation.status !== "EXPIRED") return false;
  if (!reservation.paid_at || Number(reservation.paid_at) > Number(reservation.expires_at)) return false;
  const partner = await loadPartner(reservation);
  return !!partner && partner.status === "COLLECTED";
}

async function giveBack(leg) {
  try {
    await Listing.releaseHeldStock(leg.listing_id, leg._id);
  } catch (error) {
    console.error("Bundle stock release needs reconciliation for reservation", leg._id.toString());
  }
}

export async function completePair(groupId) {
  const activated = [];
  let legs = sortLegs(await Reservation.findByBundleGroup(groupId));
  if (legs.length !== 2) return { outcome: "PENDING", legs, activated };

  if (legs.some(isEnded)) {
    await closePair(legs);
    return { outcome: "FAILED", legs: sortLegs(await Reservation.findByBundleGroup(groupId)), activated };
  }

  for (const leg of legs) {
    if (leg.bundle_state !== "FORMING" || leg.status !== "RESERVED") continue;
    let hold;
    try {
      hold = await Listing.holdStock(leg.listing_id, leg._id);
    } catch (error) {
      console.error("Bundle stock hold outcome is unknown for reservation", leg._id.toString());
      return { outcome: "PENDING", legs, activated };
    }
    if (hold === "CONTENDED") return { outcome: "PENDING", legs, activated };
    if (hold === "UNAVAILABLE") {
      await closePair(legs);
      for (const other of legs) await giveBack(other);
      return { outcome: "FAILED", legs: sortLegs(await Reservation.findByBundleGroup(groupId)), activated };
    }

    const update = { bundle_state: "ACTIVE" };
    let marked;
    try {
      marked = await Reservation.updatePayment(
        { _id: leg._id, status: "RESERVED", bundle_state: "FORMING" },
        update,
      );
    } catch (error) {
      console.error("Bundle leg activation outcome is unknown for reservation", leg._id.toString());
      return { outcome: "PENDING", legs, activated };
    }
    if (marked.modifiedCount === 1) {
      activated.push(leg);
    } else {
      const latest = await Reservation.findReservationById(leg._id);
      if (!latest || latest.status !== "RESERVED") {
        await giveBack(leg);
        await closePair(sortLegs(await Reservation.findByBundleGroup(groupId)));
        return { outcome: "FAILED", legs: sortLegs(await Reservation.findByBundleGroup(groupId)), activated };
      }
    }
  }

  legs = sortLegs(await Reservation.findByBundleGroup(groupId));
  if (legs.length !== 2) return { outcome: "PENDING", legs, activated };
  if (legs.some(isEnded)) {
    await closePair(legs);
    return { outcome: "FAILED", legs, activated };
  }
  if (legs[0].bundle_state === "ACTIVE" && legs[1].bundle_state === "ACTIVE") {
    for (const leg of legs) {
      if (leg.amount_cents > 0 && !leg.stripe_checkout_session_id) {
        try {
          await Reservation.updatePayment(
            { _id: leg._id, status: "RESERVED", payment_status: "PENDING", stripe_checkout_session_id: null },
            { payment_due_at: new Date(Number(new Date()) + 31 * 60000) },
          );
        } catch (error) {
          console.error("Bundle payment deadline could not be refreshed for reservation", leg._id.toString());
        }
      }
    }
    return { outcome: "READY", legs: sortLegs(await Reservation.findByBundleGroup(groupId)), activated };
  }
  return { outcome: "PENDING", legs, activated };
}
