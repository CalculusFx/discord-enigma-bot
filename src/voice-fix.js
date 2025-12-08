// Workaround for Discord encryption mode compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Try to load encryption libraries
const cryptoLibs = [];

try {
    const sodium = require('sodium-native');
    cryptoLibs.push('sodium-native');
    console.log('✅ Loaded sodium-native for encryption');
} catch (e) {
    console.log('⚠️ sodium-native not available:', e.message);
}

try {
    const libsodium = require('libsodium-wrappers');
    cryptoLibs.push('libsodium-wrappers');
    console.log('✅ Loaded libsodium-wrappers for encryption');
} catch (e) {
    console.log('⚠️ libsodium-wrappers not available:', e.message);
}

try {
    const stablelib = require('@stablelib/xchacha20poly1305');
    cryptoLibs.push('@stablelib/xchacha20poly1305');
    console.log('✅ Loaded @stablelib/xchacha20poly1305 for encryption');
} catch (e) {
    console.log('⚠️ @stablelib/xchacha20poly1305 not available:', e.message);
}

try {
    const noble = require('@noble/ciphers/chacha');
    cryptoLibs.push('@noble/ciphers');
    console.log('✅ Loaded @noble/ciphers for encryption');
} catch (e) {
    console.log('⚠️ @noble/ciphers not available:', e.message);
}

if (cryptoLibs.length === 0) {
    console.error('❌ No encryption libraries available! Voice features will not work.');
} else {
    console.log(`✅ ${cryptoLibs.length} encryption library(ies) loaded:`, cryptoLibs.join(', '));
}

export { cryptoLibs };
