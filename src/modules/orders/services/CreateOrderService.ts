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

    const checkInexistentsProducts = products.filter(
      requiredProduct => !existentProductsIds.includes(requiredProduct.id),
    );

    if (checkInexistentsProducts.length) {
      throw new AppError(
        `Cound not found products: ${checkInexistentsProducts
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
      throw new AppError(
        `The quantity ${productsWithNoQuantityAvailable[0].quantity} is not available for ${productsWithNoQuantityAvailable[0].id}`,
      );
    }

    const orderedProducts = products.map(requiredProduct => {
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
      products: orderedProducts,
    });

    const orderedProductsQuantity = products.map(product => ({
      id: product.id,
      quantity:
        existentProducts.filter(p => p.id === product.id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
