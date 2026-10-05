// heatherlynwilson.com/buy: same as /preorder (see preorder.js), for launch
// day and after, counted separately as "bts-buy-link".

import { countAndRedirect } from "./preorder.js";

export async function onRequestGet(context) {
  return countAndRedirect(context, "bts-buy-link");
}
