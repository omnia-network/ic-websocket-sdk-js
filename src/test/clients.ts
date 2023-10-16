import { ClientKey } from "../idl";
import { Principal } from "@dfinity/principal";

export const canisterId = Principal.fromText("bnz7o-iuaaa-aaaaa-qaaaa-cai");

// Principal: "pmisz-prtlk-b6oe6-bj4fl-6l5fy-h7c2h-so6i7-jiz2h-bgto7-piqfr-7ae"
// const client1Seed = "rabbit fun moral twin food kangaroo egg among adjust pottery measure seek";
export const client1Key: ClientKey = {
  client_principal: Principal.fromText("pmisz-prtlk-b6oe6-bj4fl-6l5fy-h7c2h-so6i7-jiz2h-bgto7-piqfr-7ae"),
  client_nonce: BigInt("5768810803147064100"),
};
