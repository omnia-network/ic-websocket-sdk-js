import {
  Cbor,
  Certificate,
  compare,
  HashTree,
  HttpAgent,
  lookup_path,
  reconstruct,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import logger from "./logger";

const areBuffersEqual = (buf1: ArrayBuffer, buf2: ArrayBuffer): boolean => {
  return compare(buf1, buf2) === 0;
}

export const isMessageBodyValid = async (
  canisterId: Principal,
  path: string,
  body: Uint8Array | ArrayBuffer,
  certificate: ArrayBuffer,
  tree: ArrayBuffer,
  agent: HttpAgent,
  maxCertificateAgeInMinutes: number,
): Promise<boolean> => {
  let cert;
  try {
    cert = await Certificate.create({
      certificate,
      canisterId,
      rootKey: agent.rootKey!,
      maxAgeInMinutes: maxCertificateAgeInMinutes,
    });
  } catch (error) {
    logger.error("[certification] Error creating certificate:", error);
    return false;
  }

  const hashTree = Cbor.decode<HashTree>(tree);
  const reconstructed = await reconstruct(hashTree);
  const witness = cert.lookup([
    "canister",
    canisterId.toUint8Array(),
    "certified_data"
  ]);

  if (!witness) {
    throw new Error(
      "Could not find certified data for this canister in the certificate."
    );
  }

  // First validate that the Tree is as good as the certification.
  if (!areBuffersEqual(witness, reconstructed)) {
    logger.error("[certification] Witness != Tree passed in ic-certification");
    return false;
  }

  // Next, calculate the SHA of the content.
  const sha = await crypto.subtle.digest("SHA-256", body);
  let treeSha = lookup_path(["websocket", path], hashTree);

  if (!treeSha) {
    // Allow fallback to index path.
    treeSha = lookup_path(["websocket"], hashTree);
  }

  if (!treeSha) {
    // The tree returned in the certification header is wrong. Return false.
    // We don't throw here, just invalidate the request.
    logger.error(
      `[certification] Invalid Tree in the header. Does not contain path ${JSON.stringify(
        path
      )}`
    );
    return false;
  }

  return !!treeSha && areBuffersEqual(sha, treeSha as ArrayBuffer);
};

export const safeExecute = async <T>(
  fn: () => T | Promise<T>,
  warnMessage: string
): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (error) {
    logger.warn(warnMessage, error);
  }
};

/**
 * Generates a random unsigned 64-bit integer
 * @returns {bigint} a random bigint
 */
export const randomBigInt = (): bigint => {
  // determine whether browser crypto is available
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new BigUint64Array(1);
    window.crypto.getRandomValues(array);
    return array[0];
  }
  // A second check for webcrypto, in case it is loaded under global instead of window
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new BigUint64Array(1);
    crypto.getRandomValues(array);
    return array[0];
  }
  // determine whether node crypto is available
  // @ts-ignore
  if (typeof crypto !== 'undefined' && crypto.randomBytes) {
    // @ts-ignore
    const randomBuffer = crypto.randomBytes(8);
    const randomHexString = randomBuffer.toString('hex');
    return BigInt('0x' + randomHexString);
  }

  // TODO: test these fallbacks in a node environment
  throw new Error('Random UInt64 generation not supported in this environment');
};
