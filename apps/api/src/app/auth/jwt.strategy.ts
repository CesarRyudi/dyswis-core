/**
 * JwtStrategy — Valida tokens JWT em rotas protegidas.
 *
 * COMO FUNCIONA: O Passport extrai o token do header "Authorization: Bearer <token>",
 * decodifica com a secret, e chama validate() com o payload.
 * O retorno de validate() é injetado em request.user.
 */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const isProduction = process.env['NODE_ENV'] === 'production';
    const jwtSecret = process.env['JWT_SECRET'];

    if (!jwtSecret && isProduction) {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production environment. API startup aborted.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret || 'dyswis-dev-secret',
    });
  }

  validate(payload: JwtPayload) {
    // O objeto retornado aqui fica disponível em req.user
    return { userId: payload.sub, email: payload.email };
  }
}
