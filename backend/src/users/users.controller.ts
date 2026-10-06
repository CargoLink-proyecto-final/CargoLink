import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { PushService, isExpoPushToken } from '../push/push.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private pushService: PushService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(@CurrentUser('id') userId: string, @Body() data: UpdateProfileDto) {
    return this.usersService.update(userId, data);
  }

  @Put('me/push-token')
  @ApiOperation({ summary: 'Register this device for push notifications' })
  async registerPushToken(
    @CurrentUser('id') userId: string,
    @Body() dto: PushTokenDto,
  ) {
    if (!isExpoPushToken(dto.token)) {
      throw new BadRequestException('El token no tiene formato de Expo push token');
    }
    await this.pushService.registerToken(userId, dto.token);
    return { registered: true };
  }

  @Delete('me')
  @ApiOperation({
    summary: 'Delete the current account permanently (anonymizes personal data)',
  })
  deleteOwnAccount(@CurrentUser('id') userId: string) {
    return this.usersService.deleteOwnAccount(userId);
  }

  @Delete('me/push-token')
  @ApiOperation({ summary: 'Stop sending push notifications to this account' })
  async clearPushToken(@CurrentUser('id') userId: string) {
    await this.pushService.clearToken(userId);
    return { registered: false };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all users (Admin only)' })
  findAll(
    @Query('role') role?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.findAll({ role, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (self or Admin)' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    // Sin este chequeo cualquier usuario autenticado podía leer la ficha de
    // cualquier otro con solo tener su id.
    if (user.role !== 'ADMIN' && user.id !== id) {
      throw new ForbiddenException('No podés ver el perfil de otro usuario');
    }
    return this.usersService.findById(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate a user (Admin only, blocked if active operations)' })
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reactivate a user (Admin only)' })
  reactivate(@Param('id') id: string) {
    return this.usersService.reactivate(id);
  }

  @Patch(':id/email')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Change a user email (Admin only, requires re-verification)' })
  changeEmail(@Param('id') id: string, @Body() dto: ChangeEmailDto) {
    return this.usersService.changeUserEmail(id, dto.email);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Change a user role (Admin only, audited)' })
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.usersService.changeRole(id, dto.role, adminId);
  }

  @Get(':id/role-history')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Role change history of a user (Admin only)' })
  roleHistory(@Param('id') id: string) {
    return this.usersService.getRoleHistory(id);
  }
}
