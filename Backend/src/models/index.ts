import { Sequelize } from 'sequelize';
import { TaprootAccount, initTaprootAccount } from './taprootAccount';
import { BalanceEvent, initBalanceEvent } from './balanceEvent';
import { PaymentChannel, initPaymentChannel } from './paymentChannel';
import { HubLedger, initHubLedger } from './hubLedger';

let modelsInitialized = false;

export const initializeModels = (sequelize: Sequelize): void => {
  if (modelsInitialized) {
    return;
  }
  
  initTaprootAccount(sequelize);
  initBalanceEvent(sequelize);
  initPaymentChannel(sequelize);
  initHubLedger(sequelize);
  
  modelsInitialized = true;
};

export { TaprootAccount, BalanceEvent, PaymentChannel, HubLedger };

