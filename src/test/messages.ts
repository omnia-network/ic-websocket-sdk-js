/**
 * These messages have been generated by running a simple canister in a local replica.
 * 
 * TODO: find a better and more robust way to generate these messages
 */

import { Cbor, fromHex } from "@dfinity/agent";
import { ClientIncomingMessage, GatewayHandshakeMessage } from "../types";
import { GATEWAY_PRINCIPAL } from "./constants";

// Messages generated from a gateway
export const VALID_HANDSHAKE_MESSAGE_FROM_GATEWAY: GatewayHandshakeMessage = {
  gateway_principal: GATEWAY_PRINCIPAL,
};

export const INVALID_HANDSHAKE_MESSAGE_FROM_GATEWAY: GatewayHandshakeMessage = {
  // @ts-ignore
  gateway_principal: "",
};

export const encodeHandshakeMessage = (message: GatewayHandshakeMessage): ArrayBuffer => {
  return Cbor.encode(message);
}

// sequence_num: 1
export const VALID_OPEN_MESSAGE: ClientIncomingMessage = {
  key: `${GATEWAY_PRINCIPAL}_00000000000000000000`,
  content: new Uint8Array(fromHex("d9d9f7a56a636c69656e745f6b6579a270636c69656e745f7072696e636970616c581db5d60075aa2a65184b85d6f66c19a53c4ed80273c484222a52e80e30026c636c69656e745f6e6f6e63651b055af797bb85950e6c73657175656e63655f6e756d016974696d657374616d701b179f3ab61f182c6c7269735f736572766963655f6d657373616765f567636f6e74656e7458894449444c066b04fdbd95cc0101bfd397b409038ff2d1ef0a049eb7f0ad0b036c01ebb49ce903026c02fa80a2940568bbd1eacd0e786c01d888abb90a786c01c49ff4e40f056b04cdc2dabb047fc9c68ea0057fd7aba29c0a7f999dafab0d7f010000011db5d60075aa2a65184b85d6f66c19a53c4ed80273c484222a52e80e30020e9585bb97f75a05")),
  cert: new Uint8Array(fromHex("d9d9f7a2647472656583018301830183024863616e6973746572830183024a800000000010000001018301830183024e6365727469666965645f6461746182035820e17d2f5533250b07d0cac69dd789e9b123aabf7663e3f91817567a0fe789a3028204582073cfb1430ef73ab885c27fd576cd8baba82d936234c18a872e75a690c6369be782045820033ceb4a3ee94c0447ef8c00e1901f5c168c6230684f759c98a13dc47a921bed8204582085e48bc6d000256b6d92382c12e88b3143418269dce4335a3a7c93041eca86d782045820f45245b933d677e216d0aeef13549138b6fdb775f2eaa1fa19f0a160a230131082045820c63979474a02d2e05c5007ca926d4bdc78c063a648f6295935cbb4154f294058830182045820c6cb372d626abbdde6f455d99734ed4fba658753d6907f121a0bb01ab67e9ea883024474696d65820349ecd8e0f8e1d6cecf17697369676e617475726558308cb526c30c54b2e9ff59bbd4175c4af2d379dabd2583d6202c8a2ef60526e138db66c70cc32012b0050b12fb4de7f04e")),
  tree: new Uint8Array(fromHex("d9d9f7830249776562736f636b657483025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f30303030303030303030303030303030303030308203582017591ba8714082846a76a1709b8fe042c894ce2f371a5e1c68907afe88c0ba5e")),
};

// acks message received from client with sequence number 1
// sequence_num: 2
export const VALID_ACK_MESSAGE: ClientIncomingMessage = {
  key: `${GATEWAY_PRINCIPAL}_00000000000000000001`,
  content: new Uint8Array(fromHex("d9d9f7a56a636c69656e745f6b6579a270636c69656e745f7072696e636970616c581db5d60075aa2a65184b85d6f66c19a53c4ed80273c484222a52e80e30026c636c69656e745f6e6f6e63651b055af797bb85950e6c73657175656e63655f6e756d026974696d657374616d701b179f3ac120a7f6ee7269735f736572766963655f6d657373616765f567636f6e74656e74586a4449444c066b04fdbd95cc0101bfd397b409038ff2d1ef0a049eb7f0ad0b036c01ebb49ce903026c02fa80a2940568bbd1eacd0e786c01d888abb90a786c01c49ff4e40f056b04cdc2dabb047fc9c68ea0057fd7aba29c0a7f999dafab0d7f0100030000000000000000")),
  cert: new Uint8Array(fromHex("d9d9f7a2647472656583018301830183024863616e6973746572830183024a800000000010000001018301830183024e6365727469666965645f64617461820358204f59e1d67de6bf162f495c7fa46d9693a0e97c1abe2bf6ae2235ae140de512b08204582073cfb1430ef73ab885c27fd576cd8baba82d936234c18a872e75a690c6369be782045820033ceb4a3ee94c0447ef8c00e1901f5c168c6230684f759c98a13dc47a921bed8204582085e48bc6d000256b6d92382c12e88b3143418269dce4335a3a7c93041eca86d78204582052f80434a99bb5174db9bca9f42b4301020993be9be4319ff1fc851e47d8920082045820c63979474a02d2e05c5007ca926d4bdc78c063a648f6295935cbb4154f29405883018204582001d3674a38c0d5b76f56c1d3e99248e716f644422a2c2fa887f80e3600853ee683024474696d65820349eeed9f8592d8cecf17697369676e61747572655830a01893ac403703ebc031837a8a658594abe7aa60fbed3f80343fc992a022c249749851b4a3a7188522f9bd5fd556048c")),
  tree: new Uint8Array(fromHex("d9d9f7830249776562736f636b6574830182045820c29cab69304c973adf7b11175fe5a543c0b84f05e92c38d0d3ef6c85150cdcea83025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f3030303030303030303030303030303030303031820358206998260b6d59c04f5035816e29c750d003df78a75b24928d3a6f13a7f78559ee")),
};

// a valid application message
// sequence_num: 3
export const VALID_MESSAGE_SEQ_NUM_3: ClientIncomingMessage = {
  key: `${GATEWAY_PRINCIPAL}_00000000000000000002`,
  content: new Uint8Array(fromHex("d9d9f7a56a636c69656e745f6b6579a270636c69656e745f7072696e636970616c581db5d60075aa2a65184b85d6f66c19a53c4ed80273c484222a52e80e30026c636c69656e745f6e6f6e63651b055af797bb85950e6c73657175656e63655f6e756d036974696d657374616d701b179f3ac8f4f3cf917269735f736572766963655f6d657373616765f467636f6e74656e74554449444c016c01ad99e7e7047101000548656c6c6f")),
  cert: new Uint8Array(fromHex("d9d9f7a2647472656583018301830183024863616e6973746572830183024a800000000010000001018301830183024e6365727469666965645f6461746182035820730723d4a52e6bde422744cacea54642a6cf82d7df27a6814de5158d125a130b8204582073cfb1430ef73ab885c27fd576cd8baba82d936234c18a872e75a690c6369be782045820033ceb4a3ee94c0447ef8c00e1901f5c168c6230684f759c98a13dc47a921bed8204582085e48bc6d000256b6d92382c12e88b3143418269dce4335a3a7c93041eca86d782045820ec35ff0ab2f8356b168b052bb5a5cb43d56167ab8d49277fdf7e668dd9e8dcbd82045820e74d26118b46be33a9651c0af2357fe1afd13b75d924e5141720597e2056bfaa8301820458208fc214c3a2869a29b8954f67a0d6c0d3f625a11748d496ac631c200001e4e32c83024474696d65820349919fcfa78fd9cecf17697369676e617475726558308c30f497405403b902ecc98d975e8d838a4751c42c07b352c72ec9d619764efb83bb4dde42e05109227ebf31f58a4147")),
  tree: new Uint8Array(fromHex("d9d9f7830249776562736f636b6574830182045820ede4ef5ed7dea5775bbf6d451886cd6ce19648b66cc110546db1662ab24d6693830183025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f3030303030303030303030303030303030303032820358206328ef4a59e2f3f5a741f74d3b2fd7c18957237c61dc89a0d43a8d88b37dbc1083025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f3030303030303030303030303030303030303033820358205313f732b30851ef3e0278575f9c959cada96b3de9cdd2d42393d0351eab1707")),
};

// same as VALID_ACK_MESSAGE but with a wrong key
export const INVALID_MESSAGE_KEY: ClientIncomingMessage = {
  key: "wrong-key", // this key is not contained in the tree
  content: new Uint8Array(fromHex("d9d9f7a56a636c69656e745f6b6579a270636c69656e745f7072696e636970616c581db5d60075aa2a65184b85d6f66c19a53c4ed80273c484222a52e80e30026c636c69656e745f6e6f6e63651b055af797bb85950e6c73657175656e63655f6e756d026974696d657374616d701b179f3ac120a7f6ee7269735f736572766963655f6d657373616765f567636f6e74656e74586a4449444c066b04fdbd95cc0101bfd397b409038ff2d1ef0a049eb7f0ad0b036c01ebb49ce903026c02fa80a2940568bbd1eacd0e786c01d888abb90a786c01c49ff4e40f056b04cdc2dabb047fc9c68ea0057fd7aba29c0a7f999dafab0d7f0100030000000000000000")),
  cert: new Uint8Array(fromHex("d9d9f7a2647472656583018301830183024863616e6973746572830183024a800000000010000001018301830183024e6365727469666965645f64617461820358204f59e1d67de6bf162f495c7fa46d9693a0e97c1abe2bf6ae2235ae140de512b08204582073cfb1430ef73ab885c27fd576cd8baba82d936234c18a872e75a690c6369be782045820033ceb4a3ee94c0447ef8c00e1901f5c168c6230684f759c98a13dc47a921bed8204582085e48bc6d000256b6d92382c12e88b3143418269dce4335a3a7c93041eca86d78204582052f80434a99bb5174db9bca9f42b4301020993be9be4319ff1fc851e47d8920082045820c63979474a02d2e05c5007ca926d4bdc78c063a648f6295935cbb4154f29405883018204582001d3674a38c0d5b76f56c1d3e99248e716f644422a2c2fa887f80e3600853ee683024474696d65820349eeed9f8592d8cecf17697369676e61747572655830a01893ac403703ebc031837a8a658594abe7aa60fbed3f80343fc992a022c249749851b4a3a7188522f9bd5fd556048c")),
  tree: new Uint8Array(fromHex("d9d9f7830249776562736f636b6574830182045820c29cab69304c973adf7b11175fe5a543c0b84f05e92c38d0d3ef6c85150cdcea83025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f3030303030303030303030303030303030303031820358206998260b6d59c04f5035816e29c750d003df78a75b24928d3a6f13a7f78559ee")),
};

// sequence_num: 4
export const VALID_CLOSE_MESSAGE: ClientIncomingMessage = {
  key: `${GATEWAY_PRINCIPAL}_00000000000000000003`,
  content: new Uint8Array(fromHex("d9d9f7a56a636c69656e745f6b6579a270636c69656e745f7072696e636970616c581db5d60075aa2a65184b85d6f66c19a53c4ed80273c484222a52e80e30026c636c69656e745f6e6f6e63651b055af797bb85950e6c73657175656e63655f6e756d046974696d657374616d701b179f3ac8f4f3cf917269735f736572766963655f6d657373616765f567636f6e74656e7458634449444c066b04fdbd95cc0101bfd397b409038ff2d1ef0a049eb7f0ad0b036c01ebb49ce903026c02fa80a2940568bbd1eacd0e786c01d888abb90a786c01c49ff4e40f056b04cdc2dabb047fc9c68ea0057fd7aba29c0a7f999dafab0d7f01000200")),
  cert: new Uint8Array(fromHex("d9d9f7a2647472656583018301830183024863616e6973746572830183024a800000000010000001018301830183024e6365727469666965645f6461746182035820730723d4a52e6bde422744cacea54642a6cf82d7df27a6814de5158d125a130b8204582073cfb1430ef73ab885c27fd576cd8baba82d936234c18a872e75a690c6369be782045820033ceb4a3ee94c0447ef8c00e1901f5c168c6230684f759c98a13dc47a921bed8204582085e48bc6d000256b6d92382c12e88b3143418269dce4335a3a7c93041eca86d782045820ec35ff0ab2f8356b168b052bb5a5cb43d56167ab8d49277fdf7e668dd9e8dcbd82045820e74d26118b46be33a9651c0af2357fe1afd13b75d924e5141720597e2056bfaa8301820458208fc214c3a2869a29b8954f67a0d6c0d3f625a11748d496ac631c200001e4e32c83024474696d65820349919fcfa78fd9cecf17697369676e617475726558308c30f497405403b902ecc98d975e8d838a4751c42c07b352c72ec9d619764efb83bb4dde42e05109227ebf31f58a4147")),
  tree: new Uint8Array(fromHex("d9d9f7830249776562736f636b6574830182045820ede4ef5ed7dea5775bbf6d451886cd6ce19648b66cc110546db1662ab24d6693830183025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f3030303030303030303030303030303030303032820358206328ef4a59e2f3f5a741f74d3b2fd7c18957237c61dc89a0d43a8d88b37dbc1083025854737164666c2d6d72346b6d2d3268666a792d67616a716f2d78717668372d6866346d662d6e726134692d336974366c2d6e656177342d736f6f6c772d7461655f3030303030303030303030303030303030303033820358205313f732b30851ef3e0278575f9c959cada96b3de9cdd2d42393d0351eab1707")),
};
