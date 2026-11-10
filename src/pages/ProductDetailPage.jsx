import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { db } from '../config/firebase';
import ProductDetail from './ProductDetail';

const ProductDetailPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [productError, setProductError] = useState('');

  useEffect(() => {
    let active = true;

    const loadProduct = async () => {
      setLoading(true);
      setProductError('');
      try {
        const snapshot = await get(ref(db, `products/${id}`));
        if (!active) return;

        if (snapshot.exists()) {
          setProduct({ id, ...snapshot.val() });
        } else {
          setProduct(null);
          setProductError('Produk tidak ditemukan atau sudah tidak tersedia.');
        }
      } catch (error) {
        if (!active) return;
        console.error('Gagal memuat detail produk:', error);
        setProduct(null);
        setProductError('Produk tidak dapat dimuat. Periksa koneksi atau coba lagi.');
      } finally {
        if (active) setLoading(false);
      }
    };

    if (id) {
      loadProduct();
    } else {
      setProduct(null);
      setProductError('Tautan produk tidak valid.');
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [id]);

  const returnToHome = (productDetailAction) => {
    navigate('/', { state: { productDetailAction } });
  };

  const handleBack = () => {
    const from = location.state?.from;
    const safeFrom = typeof from === 'string'
      && from.startsWith('/')
      && !from.startsWith('//')
      && !from.includes('\\')
      ? from
      : '/';
    navigate(safeFrom);
  };

  const handleRequireLogin = () => {
    navigate('/login?mode=login', {
      state: { from: `${location.pathname}${location.search}` }
    });
  };

  return (
    <ProductDetail
      product={product}
      isLoading={loading}
      productError={productError}
      onBack={handleBack}
      onRequireLogin={handleRequireLogin}
      onGoToCart={() => returnToHome({ type: 'cart' })}
      onVisitStore={(sellerId) => returnToHome({ type: 'store', sellerId })}
      onChatWithProduct={(selectedProduct) => returnToHome({ type: 'chat', product: selectedProduct })}
    />
  );
};

export default ProductDetailPage;
