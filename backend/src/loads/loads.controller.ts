import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as archiver from 'archiver';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { LoadsService } from './loads.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { RegisterQueryDto } from './dto/register-query.dto';
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
    @Query('q') q?: string,
    @Query('originCityId') originCityId?: string,
    @Query('destCityId') destCityId?: string,
    @Query('minWeight') minWeight?: number,
    @Query('maxWeight') maxWeight?: number,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('pickupFrom') pickupFrom?: string,
    @Query('pickupTo') pickupTo?: string,
    @Query('deliveryFrom') deliveryFrom?: string,
    @Query('deliveryTo') deliveryTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.loadsService.findAll({
      status, cargoType, q, originCityId, destCityId,
      minWeight: minWeight ? Number(minWeight) : undefined,
      maxWeight: maxWeight ? Number(maxWeight) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      createdFrom, createdTo, pickupFrom, pickupTo, deliveryFrom, deliveryTo,
      page, limit,
    });
  }

  @Get('filter-cities')
  @ApiOperation({
    summary: 'Cities present in the loads the caller can see — feeds the filter dropdown',
  })
  getFilterCities(@CurrentUser() user: { id: string; role: string }) {
    return this.loadsService.findFilterCities(user);
  }

  @Get('available')
  @ApiOperation({ summary: 'List available loads for carriers with filters' })
  findAvailable(
    @CurrentUser('id') userId: string,
    @Query('cargoType') cargoType?: string,
    @Query('q') q?: string,
    @Query('originCityId') originCityId?: string,
    @Query('destCityId') destCityId?: string,
    @Query('minWeight') minWeight?: number,
    @Query('maxWeight') maxWeight?: number,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('pickupFrom') pickupFrom?: string,
    @Query('pickupTo') pickupTo?: string,
    @Query('deliveryFrom') deliveryFrom?: string,
    @Query('deliveryTo') deliveryTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // Las cargas se priorizan por la zona de influencia del transportista (P12)
    // dentro del service, según el userId.
    return this.loadsService.findAvailable(userId, {
      cargoType, q, originCityId, destCityId,
      minWeight: minWeight ? Number(minWeight) : undefined,
      maxWeight: maxWeight ? Number(maxWeight) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      createdFrom, createdTo, pickupFrom, pickupTo, deliveryFrom, deliveryTo,
      page, limit,
    });
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'List my loads (Shipper)' })
  findMyLoads(
    @CurrentUser('id') userId: string,
    @Query('status') status?: LoadStatus,
    @Query('cargoType') cargoType?: string,
    @Query('q') q?: string,
    @Query('originCityId') originCityId?: string,
    @Query('destCityId') destCityId?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('pickupFrom') pickupFrom?: string,
    @Query('pickupTo') pickupTo?: string,
    @Query('deliveryFrom') deliveryFrom?: string,
    @Query('deliveryTo') deliveryTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.loadsService.findAll({
      shipperId: userId,
      status, cargoType, q, originCityId, destCityId,
      createdFrom, createdTo, pickupFrom, pickupTo, deliveryFrom, deliveryTo,
      page, limit,
    });
  }

  @Get('register')
  @ApiOperation({
    summary:
      'Register of closed loads (DELIVERED/CANCELLED) — admin sees all, shipper sees own, carrier sees carried',
  })
  getRegister(
    @CurrentUser() user: { id: string; role: string },
    @Query() query: RegisterQueryDto,
  ) {
    return this.loadsService.getRegister(user, query);
  }

  @Get('register/export')
  @ApiOperation({ summary: 'Export register as ZIP (loads.csv + messages.csv)' })
  async exportRegister(
    @CurrentUser() user: { id: string; role: string },
    @Query() query: RegisterQueryDto,
    @Res() res: Response,
  ) {
    const loads = await this.loadsService.getRegisterForExport(user, query);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `registro-cargas-${today}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
      throw err;
    });
    archive.pipe(res);

    archive.append(buildLoadsCsv(loads), { name: 'loads.csv' });
    archive.append(buildMessagesCsv(loads), { name: 'messages.csv' });

    await archive.finalize();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get load details' })
  findOne(@Param('id') id: string, @CurrentUser('role') role?: string) {
    return this.loadsService.findById(id, role);
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

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',') + '\n';
}

function fullName(u?: { firstName?: string; lastName?: string; companyName?: string | null }) {
  if (!u) return '';
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return u.companyName ? `${name} (${u.companyName})` : name;
}

function buildLoadsCsv(loads: any[]): string {
  const header = csvRow([
    'load_id', 'title', 'status', 'cargo_type', 'weight_kg', 'volume_m3', 'price',
    'origin_address', 'origin_lat', 'origin_lng',
    'dest_address', 'dest_lat', 'dest_lng',
    'pickup_date', 'delivery_date_expected',
    'shipper_id', 'shipper_name', 'shipper_email', 'shipper_phone',
    'trip_id', 'trip_status', 'started_at', 'completed_at', 'trip_notes',
    'carrier_id', 'carrier_name', 'carrier_email', 'carrier_phone',
    'message_count',
    'created_at', 'updated_at',
  ]);
  const rows = loads.map((l) => {
    const trip = l.trip;
    return csvRow([
      l.id, l.title, l.status, l.cargoType, l.weight, l.volume ?? '', l.price,
      l.originAddress, l.originLat, l.originLng,
      l.destAddress, l.destLat, l.destLng,
      l.pickupDate, l.deliveryDate ?? '',
      l.shipper?.id, fullName(l.shipper), l.shipper?.email, l.shipper?.phone ?? '',
      trip?.id ?? '', trip?.status ?? '', trip?.startedAt ?? '', trip?.completedAt ?? '', trip?.notes ?? '',
      trip?.carrier?.id ?? '', fullName(trip?.carrier), trip?.carrier?.email ?? '', trip?.carrier?.phone ?? '',
      trip?.messages?.length ?? 0,
      l.createdAt, l.updatedAt,
    ]);
  });
  return header + rows.join('');
}

function buildMessagesCsv(loads: any[]): string {
  const header = csvRow([
    'message_id', 'trip_id', 'load_id', 'load_title',
    'sender_id', 'sender_name', 'content', 'is_read', 'created_at',
  ]);
  const rows: string[] = [];
  for (const l of loads) {
    const messages = l.trip?.messages ?? [];
    for (const m of messages) {
      rows.push(csvRow([
        m.id, l.trip.id, l.id, l.title,
        m.senderId, fullName(m.sender), m.content, m.isRead, m.createdAt,
      ]));
    }
  }
  return header + rows.join('');
}
