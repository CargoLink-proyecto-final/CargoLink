import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { LoadsService } from './loads.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoadStatus } from '@prisma/client';

@ApiTags('Loads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loads')
export class LoadsController {
  constructor(private loadsService: LoadsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'Create a new load (Shipper only)' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateLoadDto) {
    return this.loadsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all loads with filters' })
  findAll(
    @Query('status') status?: LoadStatus,
    @Query('cargoType') cargoType?: string,
    @Query('minWeight') minWeight?: number,
    @Query('maxWeight') maxWeight?: number,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.loadsService.findAll({
      status, cargoType,
      minWeight: minWeight ? Number(minWeight) : undefined,
      maxWeight: maxWeight ? Number(maxWeight) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page, limit,
    });
  }

  @Get('available')
  @ApiOperation({ summary: 'List available loads for carriers with filters' })
  findAvailable(
    @Query('cargoType') cargoType?: string,
    @Query('minWeight') minWeight?: number,
    @Query('maxWeight') maxWeight?: number,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.loadsService.findAll({
      status: LoadStatus.PUBLISHED,
      cargoType,
      minWeight: minWeight ? Number(minWeight) : undefined,
      maxWeight: maxWeight ? Number(maxWeight) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page, limit,
    });
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'List my loads (Shipper)' })
  findMyLoads(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.loadsService.findAll({ shipperId: userId, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get load details' })
  findOne(@Param('id') id: string) {
    return this.loadsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'Update a load (Shipper only)' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLoadDto,
  ) {
    return this.loadsService.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'Cancel a load (Shipper only)' })
  cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.loadsService.cancel(id, userId);
  }
}
