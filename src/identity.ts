import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";

export const generateRandomIdentity = (): Secp256k1KeyIdentity => {
  return Secp256k1KeyIdentity.generate();
};
