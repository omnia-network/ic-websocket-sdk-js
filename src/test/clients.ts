import { ClientKey } from "../idl";
import { Principal } from "@dfinity/principal";

export const canisterId = Principal.fromText("bnz7o-iuaaa-aaaaa-qaaaa-cai");

export const client1Key: ClientKey = {
  client_principal: Principal.fromText("kj67s-b5v2y-ahlkr-kmume-xbow6-zwbtj-j4j3m-ae46e-qqrcu-uxiby-yae"),
  client_nonce: BigInt("385892949151814926"),
};
