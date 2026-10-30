import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env['GOOGLE_CLIENT_ID'] || 'PLACEHOLDER',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || 'PLACEHOLDER',
      callbackURL: process.env['GOOGLE_CALLBACK_URL'] || 'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { name, emails, id } = profile;
    const email = emails?.[0]?.value || '';
    const displayName = name?.givenName ? `${name.givenName} ${name.familyName || ''}`.trim() : (profile.displayName || email);
    
    try {
      const jwtPayload = await this.authService.validateOAuthUser(email, displayName, id);
      done(null, jwtPayload);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
