import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface IPaymentChannel {
  id?: number;
  channelId: string; // Unique channel identifier
  taprootAddress: string; // Funding taproot address (L1)
  userAddress: string; // User's address
  hubAddress: string; // Hub's address
  userBalance: number; // User's balance in channel (sats)
  hubBalance: number; // Hub's balance in channel (sats)
  capacity: number; // Total channel capacity (sats)
  status: 'opening' | 'open' | 'closing' | 'closed'; // Channel status
  fundingTxid?: string | null; // L1 funding transaction ID
  closingTxid?: string | null; // L1 closing transaction ID
  commitmentNumber: number; // Current commitment transaction number
  lastCommitmentHash?: string | null; // Hash of last commitment transaction
  createdAt?: Date;
  updatedAt?: Date;
}

interface PaymentChannelCreationAttributes extends Optional<IPaymentChannel, 'id' | 'createdAt' | 'updatedAt' | 'fundingTxid' | 'closingTxid' | 'lastCommitmentHash'> {}

export class PaymentChannel extends Model<IPaymentChannel, PaymentChannelCreationAttributes> implements IPaymentChannel {
  public id!: number;
  public channelId!: string;
  public taprootAddress!: string;
  public userAddress!: string;
  public hubAddress!: string;
  public userBalance!: number;
  public hubBalance!: number;
  public capacity!: number;
  public status!: 'opening' | 'open' | 'closing' | 'closed';
  public fundingTxid?: string | null;
  public closingTxid?: string | null;
  public commitmentNumber!: number;
  public lastCommitmentHash?: string | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export const initPaymentChannel = (sequelize: Sequelize): typeof PaymentChannel => {
  PaymentChannel.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      channelId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      taprootAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      userAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      hubAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      userBalance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      hubBalance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      capacity: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('opening', 'open', 'closing', 'closed'),
        allowNull: false,
        defaultValue: 'opening',
      },
      fundingTxid: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      closingTxid: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      commitmentNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastCommitmentHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'payment_channels',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['channelId'],
        },
        {
          fields: ['userAddress', 'status'],
        },
        {
          fields: ['hubAddress', 'status'],
        },
        {
          fields: ['taprootAddress'],
        },
        {
          fields: ['status'],
        },
      ],
    }
  );
  return PaymentChannel;
};

