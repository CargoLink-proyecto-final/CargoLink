import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage, FileFilterCallback } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TransporterProfileService } from './transporter-profile.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpsertVehicleDto } from './dto/upsert-vehicle.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const documentUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: FileFilterCallback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new BadRequestException('Formato de archivo no permitido (solo JPG, PNG o PDF)'));
      return;
    }
    callback(null, true);
  },
};

@ApiTags('TransporterProfile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transporter-profile')
export class TransporterProfileController {
  constructor(private transporterProfileService: TransporterProfileService) {}

  @Post('documents')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace a profile document (Transporter only)' })
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo');
    return this.transporterProfileService.uploadDocument(userId, dto.type, file);
  }

  @Get('documents')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'List my uploaded documents (Transporter)' })
  listDocuments(@CurrentUser('id') userId: string) {
    return this.transporterProfileService.listDocuments(userId);
  }

  @Get('documents/:id/file')
  @ApiOperation({ summary: 'Download a document file (owner or Admin)' })
  async getDocumentFile(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const { absolutePath, contentType } = await this.transporterProfileService.getDocumentFile(
      id,
      user.id,
      user.role,
    );
    res.setHeader('Content-Type', contentType);
    res.sendFile(absolutePath);
  }

  @Delete('documents/:id')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Delete one of my documents (Transporter)' })
  deleteDocument(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.transporterProfileService.deleteDocument(id, userId);
  }

  @Put('vehicle')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Create or replace my vehicle (Transporter)' })
  upsertVehicle(@CurrentUser('id') userId: string, @Body() dto: UpsertVehicleDto) {
    return this.transporterProfileService.upsertVehicle(userId, dto);
  }

  @Get('vehicle')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Get my vehicle (Transporter)' })
  getVehicle(@CurrentUser('id') userId: string) {
    return this.transporterProfileService.getVehicle(userId);
  }

  @Post('terms')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Accept the sworn-statement terms (Transporter)' })
  acceptTerms(@CurrentUser('id') userId: string, @Body() dto: AcceptTermsDto) {
    return this.transporterProfileService.acceptTerms(userId, dto.version);
  }

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Get my profile completeness status (Transporter)' })
  getStatus(@CurrentUser('id') userId: string) {
    return this.transporterProfileService.getStatus(userId);
  }
}
