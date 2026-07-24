import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverWorkModule } from '../driver-work/driver-work.module';
import { OrderEntity } from '../orders/order.entity';
import { DriverSurveyResponseEntity } from './driver-survey-response.entity';
import { RoadConditionStateEntity } from './road-condition-state.entity';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverSurveyResponseEntity,
      RoadConditionStateEntity,
      OrderEntity,
    ]),
    DriverWorkModule,
  ],
  controllers: [SurveysController],
  providers: [SurveysService],
  exports: [SurveysService],
})
export class SurveysModule {}
