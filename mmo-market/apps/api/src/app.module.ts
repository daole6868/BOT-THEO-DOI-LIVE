import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthGuard } from './common/auth.guard';
import { CommonModule } from './common/common.module';
import { CsrfMiddleware, RequestIdMiddleware } from './common/middleware';
import { AdminFinanceController } from './modules/admin/admin-finance.controller';
import { AdminDisputesController, AdminOrdersController, AdminProductsController } from './modules/admin/admin-ops.controller';
import { AdminCommunityController, AdminStaffController, AdminSystemController } from './modules/admin/admin-system.controller';
import { AdminDashboardController, AdminStoresController, AdminUsersController } from './modules/admin/admin-users.controller';
import { AnalyticsService } from './modules/analytics/analytics.service';
import { SellerDashboardController } from './modules/analytics/seller-dashboard.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BoardController, CommentsController, OffersController, SellerOffersController } from './modules/board/board.controller';
import { BoardService } from './modules/board/board.service';
import { AdminCategoriesController, CategoriesController } from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import { AdminSupportController, ChatController } from './modules/chat/chat.controller';
import { ChatGateway } from './modules/chat/chat.gateway';
import { ChatService } from './modules/chat/chat.service';
import { DisputesService } from './modules/disputes/disputes.service';
import { HomeController } from './modules/home/home.controller';
import { JobsService } from './modules/jobs/jobs.service';
import { LedgerService } from './modules/ledger/ledger.service';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { EscrowService } from './modules/orders/escrow.service';
import { DisputesController, OrdersController, SellerOrdersController } from './modules/orders/orders.controller';
import { OrdersService } from './modules/orders/orders.service';
import { ProductsController, SellerProductsController, SellerStockController } from './modules/products/products.controller';
import { ProductsService } from './modules/products/products.service';
import { AdminReportsController, ReportsController } from './modules/reports/reports.controller';
import { ReportsService } from './modules/reports/reports.service';
import { ReviewsService } from './modules/reviews/reviews.service';
import { SearchController } from './modules/search/search.controller';
import { SearchService } from './modules/search/search.service';
import { AdminSellerApplicationsController, SellerApplicationsController, SellerStoreController, StoresController } from './modules/stores/stores.controller';
import { StoresService } from './modules/stores/stores.service';
import { UploadsController } from './modules/uploads/uploads.controller';
import { UsersController } from './modules/users/users.controller';
import { AdjustmentsService } from './modules/wallet/adjustments.service';
import { DepositsService } from './modules/wallet/deposits.service';
import { DevToolsController, PaymentWebhookController, WalletController } from './modules/wallet/wallet.controller';
import { WithdrawalsService } from './modules/wallet/withdrawals.service';

@Module({
  imports: [CommonModule, ScheduleModule.forRoot(), AuthModule],
  controllers: [
    HomeController,
    UsersController,
    UploadsController,
    CategoriesController,
    SearchController,
    ProductsController,
    StoresController,
    SellerApplicationsController,
    WalletController,
    PaymentWebhookController,
    DevToolsController,
    OrdersController,
    DisputesController,
    BoardController,
    CommentsController,
    OffersController,
    ChatController,
    NotificationsController,
    ReportsController,
    // Seller Center
    SellerDashboardController,
    SellerProductsController,
    SellerStockController,
    SellerStoreController,
    SellerOrdersController,
    SellerOffersController,
    // Admin
    AdminDashboardController,
    AdminUsersController,
    AdminStoresController,
    AdminSellerApplicationsController,
    AdminCategoriesController,
    AdminProductsController,
    AdminOrdersController,
    AdminDisputesController,
    AdminFinanceController,
    AdminCommunityController,
    AdminReportsController,
    AdminSupportController,
    AdminStaffController,
    AdminSystemController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    CatalogService,
    SearchService,
    ProductsService,
    StoresService,
    LedgerService,
    DepositsService,
    WithdrawalsService,
    AdjustmentsService,
    EscrowService,
    OrdersService,
    DisputesService,
    ReviewsService,
    BoardService,
    ChatService,
    ChatGateway,
    ReportsService,
    AnalyticsService,
    JobsService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, CsrfMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
