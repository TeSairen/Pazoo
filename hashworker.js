self.importScripts("./static/argon2-bundled.min.js");

self.onmessage = function (e) {
  const { password, saltString } = e.data;
  const encoder = new TextEncoder();
  const salt = encoder.encode(saltString);

  argon2
    .hash({
      pass: password,
      salt: salt,
      time: 3,
      mem: 20480, // 16384 or 20480
      hashLen: 32,
      parallelism: 1,
      type: argon2.ArgonType.Argon2id,
    })
    .then((result) => {
      const newPassword = "Z#" + extractDigest(result.encoded);
      self.postMessage({ newPassword: newPassword });
    })
    .catch((error) => {
      self.postMessage({ error: error.toString() });
    });
};

function extractDigest(fullHash) {
  const passwordBase64 = fullHash.split("$").pop();
  return convertToUrlSafeBase64(passwordBase64);
}

function convertToUrlSafeBase64(base64String) {
  return base64String.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
