import { WinstonModuleOptions, utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/winston';

export const loggerConfig: WinstonModuleOptions = {
  // Configuração global para injetar variáveis em todos os logs
  defaultMeta: {
    environment: process.env.NODE_ENV || 'development',
    service: 'dyswis-api',
  },
  transports: [
    // Transporte padrão para o Console (útil para desenvolvimento)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('DyswisAPI', {
          colors: process.env.NODE_ENV !== 'production',
          prettyPrint: true,
        }),
      ),
    }),
    // Transporte do Axiom só é habilitado se tiver o token
    ...(process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET
      ? [
          new AxiomTransport({
            dataset: process.env.AXIOM_DATASET,
            token: process.env.AXIOM_TOKEN,
            // Fallbacks em caso de erro no Axiom
            handleExceptions: true,
            handleRejections: true,
          }),
        ]
      : []),
  ],
};
