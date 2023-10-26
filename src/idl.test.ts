import { ClientKey, extractApplicationMessageIdlFromActor, isClientKeyEq } from "./idl";
import { generateRandomIdentity } from "./identity";
import { randomBigInt } from "./utils";
import { Principal } from "@dfinity/principal";
import { AppMessage, _SERVICE, getTestCanisterActor, getTestCanisterActorWithoutMethods, getTestCanisterActorWrongArgs, getTestCanisterActorWrongOpt } from "./test/actor";
import { IDL } from "@dfinity/candid";

const generateRandomClientKey = (): ClientKey => {
  return {
    client_principal: generateRandomIdentity().getPrincipal(),
    client_nonce: randomBigInt(),
  };
};

describe("isClientKeyEq", () => {
  it("should return true if the keys are the same", () => {
    const clientKey = generateRandomClientKey();
    const result = isClientKeyEq(clientKey, clientKey);
    expect(result).toBe(true);
  });

  it("should return false if the keys are not the same", () => {
    const clientKey1 = generateRandomClientKey();
    const clientKey2 = generateRandomClientKey();
    const result = isClientKeyEq(clientKey1, clientKey2);
    expect(result).toBe(false);
  });

  it("should return false if the principals are not the same", () => {
    const clientKey1 = generateRandomClientKey();
    const clientKey2 = {
      ...clientKey1,
      client_principal: generateRandomIdentity().getPrincipal(),
    };
    const result = isClientKeyEq(clientKey1, clientKey2);
    expect(result).toBe(false);
  });

  it("should return false if the nonces are not the same", () => {
    const clientKey1 = generateRandomClientKey();
    const clientKey2 = {
      ...clientKey1,
      client_nonce: randomBigInt(),
    };
    const result = isClientKeyEq(clientKey1, clientKey2);
    expect(result).toBe(false);
  });
});

describe("extractApplicationMessageIdlFromActor", () => {
  const canisterId = Principal.fromText("bnz7o-iuaaa-aaaaa-qaaaa-cai");

  it("fails if the actor does not implement ws_message", () => {
    expect(() => extractApplicationMessageIdlFromActor<AppMessage, _SERVICE>(getTestCanisterActorWithoutMethods(canisterId))).toThrowError("Canister does not implement ws_message method");
  });

  it("fails if thw ws_message method doesn't have 2 arguments", () => {
    expect(() => extractApplicationMessageIdlFromActor<AppMessage, _SERVICE>(getTestCanisterActorWrongArgs(canisterId))).toThrowError("ws_message method must have 2 arguments");
  });

  it("fails if the application message type is not optional", () => {
    expect(() => extractApplicationMessageIdlFromActor<AppMessage, _SERVICE>(getTestCanisterActorWrongOpt(canisterId))).toThrowError("Application message type must be optional in the ws_message arguments");
  });

  it("extracts the application message idl from the actor", () => {
    const applicationMessageIdl = extractApplicationMessageIdlFromActor<AppMessage, _SERVICE>(getTestCanisterActor(canisterId));
    expect(applicationMessageIdl).toEqual(IDL.Record({ 'text': IDL.Text }));
  });
});
