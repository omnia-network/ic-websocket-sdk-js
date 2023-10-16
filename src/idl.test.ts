import { ClientKey, isClientKeyEq } from "./idl";
import { generateRandomIdentity } from "./identity";
import { randomBigInt } from "./utils";

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
