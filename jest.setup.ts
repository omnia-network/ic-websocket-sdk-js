import crypto from "isomorphic-webcrypto";
import { TransformStream } from "web-streams-polyfill";

Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: crypto.getRandomValues,
    subtle: crypto.subtle,
  }
});

global.TransformStream = TransformStream;
