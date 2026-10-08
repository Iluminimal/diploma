import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type Cart = components["schemas"]["CartOut"];
export type CartLine = components["schemas"]["CartLineOut"];
export type NewCartItem = components["schemas"]["CartItemIn"];

export const fetchCart = () => call(browserApi().GET("/api/v1/cart"));

export const addCartItem = (body: NewCartItem) => call(browserApi().POST("/api/v1/cart/items", { body }));

export const updateCartItem = (itemId: number, quantity: number) =>
  call(
    browserApi().PATCH("/api/v1/cart/items/{item_id}", {
      params: { path: { item_id: itemId } },
      body: { quantity },
    }),
  );

export const removeCartItem = (itemId: number) =>
  call(browserApi().DELETE("/api/v1/cart/items/{item_id}", { params: { path: { item_id: itemId } } }));
