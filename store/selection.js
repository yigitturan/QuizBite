// store/selection.js
let SELECTED_RESTAURANT = null; // { id, name } | null

export function getSelectedRestaurant() {
  return SELECTED_RESTAURANT;
}

export function setSelectedRestaurant(obj) {
  SELECTED_RESTAURANT = obj;
}
