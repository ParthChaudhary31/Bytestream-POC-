import { Sequelize } from 'sequelize';
import { TaprootAccount, initTaprootAccount } from './taprootAccount';
import { BalanceEvent, initBalanceEvent } from './balanceEvent';

let modelsInitialized = false;

export const initializeModels = (sequelize: Sequelize): void => {
  if (modelsInitialized) {
    return;
  }
  
  initTaprootAccount(sequelize);
  initBalanceEvent(sequelize);
  
  modelsInitialized = true;
};

export { TaprootAccount, BalanceEvent };

