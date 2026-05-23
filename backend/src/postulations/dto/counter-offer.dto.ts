import { IsNumber, IsPositive } from 'class-validator';

export class CounterOfferDto {
  @IsNumber()
  @IsPositive()
  price: number;
}
