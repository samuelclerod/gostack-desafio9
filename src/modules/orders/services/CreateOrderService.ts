import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('Could not find any user with given id');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );
    if (!existentProducts.length) {
      throw new AppError('Could not find any products with given ids');
    }
    const existentProductsIds = existentProducts.map(product => product.id);

    const inexistentProducts = products.filter(
      requiredProduct => !existentProductsIds.includes(requiredProduct.id),
    );

    if (inexistentProducts.length) {
      throw new AppError(
        `Cound not found products: ${inexistentProducts
          .map(p => p.id)
          .join(', ')}`,
      );
    }

    const productsWithNoQuantityAvailable = products.filter(
      requiredProduct =>
        existentProducts.filter(product => product.id === requiredProduct.id)[0]
          .quantity < requiredProduct.quantity,
    );

    if (productsWithNoQuantityAvailable.length) {
      const errorMessage = productsWithNoQuantityAvailable
        .map(
          product =>
            `The quantity ${product.quantity} is not available for product ${product.id}`,
        )
        .join('. ');
      throw new AppError(errorMessage);
    }

    const formatedOrderedProducts = products.map(requiredProduct => {
      const existentProduct = existentProducts.filter(
        product => product.id === requiredProduct.id,
      )[0];
      return {
        product_id: requiredProduct.id,
        quantity: requiredProduct.quantity,
        price: existentProduct.price,
      };
    });

    const order = await this.ordersRepository.create({
      customer,
      products: formatedOrderedProducts,
    });

    const productsWithUpdatedQuantity = products.map(requiredProduct => {
      const existentProduct = existentProducts.filter(
        product => product.id === requiredProduct.id,
      )[0];

      return {
        id: requiredProduct.id,
        quantity: existentProduct.quantity - requiredProduct.quantity,
      };
    });

    await this.productsRepository.updateQuantity(productsWithUpdatedQuantity);

    return order;
  }
}

export default CreateOrderService;
