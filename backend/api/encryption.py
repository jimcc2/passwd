from django.conf import settings
from cryptography.fernet import Fernet

# IMPORTANT: This is a simplified encryption model where the server holds the key.
# For a true zero-knowledge system, this key should be derived from the user's
# master password on the client-side and never stored on the server.
# We are using a single key from settings for now.
# Ensure SECRET_KEY is strong and kept secret.
key = settings.SECRET_KEY.encode()
# Fernet keys must be 32 bytes and url-safe base64 encoded.
# We will use a KDF in a real scenario. For now, we'll pad it.
# This is NOT secure for production.
import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# This is still not ideal, but better than padding.
# A dedicated, randomly generated key is best.
salt = b'some-salt' # In production, use a unique salt per user or a global random salt
kdf = PBKDF2HMAC(
    algorithm=hashes.SHA256(),
    length=32,
    salt=salt,
    iterations=100000,
)
fernet_key = base64.urlsafe_b64encode(kdf.derive(key))
cipher_suite = Fernet(fernet_key)

def encrypt_data(data):
    """Encrypts a string."""
    if not data:
        return None
    return cipher_suite.encrypt(data.encode()).decode()

def decrypt_data(encrypted_data):
    """Decrypts a string."""
    if not encrypted_data:
        return None
    return cipher_suite.decrypt(encrypted_data.encode()).decode()
