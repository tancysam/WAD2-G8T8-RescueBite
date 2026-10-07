import Listing from "../models/Listing.js";
import aiService from "../services/aiService.js";

export async function createListing(req, res) {
  // creation of listing
}

export async function getListingsByParams(req, res) {
  // get listing based on category, price
}

export async function getListingById(req, res) {
  // get listing based off of the id, in the params :id
}

export async function getBusinessListings(req, res) {
  // get business listings based off of the id
}

export async function getManagedListings(req, res) {
  // get managed listings
  // This means that regardless of whether its active or inactive, this will return all
}

export async function updateListing(req, res) {
  // update listing info
}

export async function deleteListing(req, res) {
  // delete listing
}

export async function generateListingSuggestions(req, res) {
  // generate listing suggestions based on uploaded image, which will be
  // given to service AI
}
