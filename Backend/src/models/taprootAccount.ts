import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface ITaprootAccount {
  id?: number;
  address: string;
  userAddress?: string | null;
  hubAddress?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  lastBalanceCheck?: Date | null;
  lastKnownBalance?: number | null;
  isActive: boolean;
}

interface TaprootAccountCreationAttributes extends Optional<ITaprootAccount, 'id' | 'createdAt' | 'updatedAt' | 'lastBalanceCheck' | 'lastKnownBalance' | 'isActive'> {}

export class TaprootAccount extends Model<ITaprootAccount, TaprootAccountCreationAttributes> implements ITaprootAccount {
  public id!: number;
  public address!: string;
  public userAddress?: string | null;
  public hubAddress?: string | null;
  public createdAt!: Date;
  public updatedAt!: Date;
  public lastBalanceCheck?: Date | null;
  public lastKnownBalance?: number | null;
  public isActive!: boolean;
}

export const initTaprootAccount = (sequelize: Sequelize): typeof TaprootAccount => {
  TaprootAccount.init(
  {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
    address: {
        type: DataTypes.STRING,
        allowNull: false,
      unique: true,
    },
    userAddress: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    hubAddress: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lastBalanceCheck: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    lastKnownBalance: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: 0,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
  },
  {
      sequelize,
      tableName: 'taproot_accounts',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['address'],
        },
        {
          fields: ['isActive', 'createdAt'],
        },
        {
          fields: ['userAddress'],
        },
        {
          fields: ['hubAddress'],
        },
      ],
    }
  );
  return TaprootAccount;
};

