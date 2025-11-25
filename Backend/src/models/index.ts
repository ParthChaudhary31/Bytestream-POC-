import { Sequelize } from 'sequelize';
import { TaprootAccount, initTaprootAccount } from './taprootAccount';
import { BalanceEvent, initBalanceEvent } from './balanceEvent';
import { PaymentChannel, initPaymentChannel } from './paymentChannel';

let modelsInitialized = false;

export const initializeModels = (sequelize: Sequelize): void => {
  if (modelsInitialized) {
    return;
  }
  
  initTaprootAccount(sequelize);
  initBalanceEvent(sequelize);
  initPaymentChannel(sequelize);
  
  modelsInitialized = true;
};

export { TaprootAccount, BalanceEvent, PaymentChannel };

