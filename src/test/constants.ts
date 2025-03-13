import { fromHex } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";

export const GATEWAY_PRINCIPAL = Principal.fromText("sqdfl-mr4km-2hfjy-gajqo-xqvh7-hf4mf-nra4i-3it6l-neaw4-soolw-tae");

export const LOCAL_REPLICA_ROOT_KEY = fromHex("d9d9f7a66e69635f6170695f76657273696f6e66302e31382e3068726f6f745f6b65795885308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c050302010361008005229d89a17c6f9ec403a4b1a8aa103fc48055046c95f1e60ee2fbfb0bb23ab21617a93f48b99b1199ac89008cf3cf0a83e9da35f5cf27d0d51535ceff89c43ee236c31c3a7865cc6b333194ad3f7155b2931a7ffec2066777dffb20f277ca6c696d706c5f76657273696f6e65302e382e3069696d706c5f68617368784064613931633732316637386462393433346561336630303437383939383836346439313731346538626561363862333963633736326662306263383937313662757265706c6963615f6865616c74685f737461747573676865616c746879706365727469666965645f68656967687418d4");

const YEAR_IN_MINUTES = 365 * 24 * 60;
/**
 * The max age of the certificate (5 years).
 * Since we're using pre-generated certificates, we need to set it really far in the future.
 */
export const MAX_CERTIFICATE_AGE_IN_MINUTES = 5 * YEAR_IN_MINUTES;
