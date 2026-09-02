// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Zero out a buffer in place. No-ops silently on anything that isn't a
 * Buffer/TypedArray - in particular, on a string, which can't be zeroed at
 * all (mirrors pear-wrk-wdk's src/utils/crypto.js memzero).
 *
 * Only zero a buffer you own: one you allocated yourself, or one you're the
 * sole remaining consumer of and are finished with. Never a buffer just
 * handed to you as a parameter that a caller still expects to use.
 */
export function memzero(buffer?: Buffer | Uint8Array | null): void {
  if (!buffer) return
  if (buffer instanceof Uint8Array) {
    buffer.fill(0)
  }
}
