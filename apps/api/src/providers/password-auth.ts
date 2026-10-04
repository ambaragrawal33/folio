import argon2 from 'argon2';
export interface PasswordProvider {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
export class PasswordAuthProvider implements PasswordProvider {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }
  async verify(hash: string, password: string) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
