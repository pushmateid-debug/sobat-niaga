import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ProductDetail from './ProductDetail';

const ProductDetailPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

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

  const returnToHome = (productDetailAction) => {
    navigate('/', { state: { productDetailAction } });
  };

  return (
    <ProductDetail
      productId={id}
      onBack={handleBack}
      onRequireLogin={() => navigate('/login?mode=login', {
        state: { from: `${location.pathname}${location.search}` }
      })}
      onGoToCart={() => returnToHome({ type: 'cart' })}
      onVisitStore={(sellerId) => returnToHome({ type: 'store', sellerId })}
      onChatWithProduct={(product) => returnToHome({ type: 'chat', product })}
    />
  );
};

export default ProductDetailPage;
