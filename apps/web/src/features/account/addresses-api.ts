import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type Address = components["schemas"]["AddressOut"];
export type AddressInput = components["schemas"]["AddressIn"];
export type AddressChanges = components["schemas"]["AddressUpdate"];

export const fetchAddresses = () => call(browserApi().GET("/api/v1/addresses"));

export const createAddress = (body: AddressInput) => call(browserApi().POST("/api/v1/addresses", { body }));

export const updateAddress = (id: number, body: AddressChanges) =>
  call(browserApi().PATCH("/api/v1/addresses/{address_id}", { params: { path: { address_id: id } }, body }));

export const deleteAddress = (id: number) =>
  call(browserApi().DELETE("/api/v1/addresses/{address_id}", { params: { path: { address_id: id } } }));
